import { createLogger, normalizeError, reportExecutionStatus, resolveConfig } from '@automation/shared';
import { createFinalizationStore } from './finalizationStore.js';
import { handler as runIntegration } from './handler.js';

function shouldRetry(error) {
  if (error.providerError?.api === 'ITC template message API') return false;
  if (error.retryable === true) return true;
  return /(?:Timeout|Throttl|ServiceUnavailable|InternalServer|Networking)/i.test(String(error.name || ''));
}

function lifecycleDetails(job) {
  return {
    integrationName: job.integrationName || 'priority-order-itc',
    integrationId: job.integrationId,
    triggerType: job.triggerType || 'queue',
    executionMode: job.mode || job.executionMode || 'dry_run',
  };
}

async function processJob(job, recordId, runtime = {}) {
  const jobId = job.id || job.executionId || recordId;
  const logger = createLogger({ service: 'priority-order-itc', jobId });
  const details = lifecycleDetails(job);
  const startedAt = new Date().toISOString();
  const liveMode = (job.mode || job.executionMode) === 'live';
  const statusReporter = runtime.reportStatus || reportExecutionStatus;
  const configResolver = runtime.resolveConfig || resolveConfig;
  const integrationRunner = runtime.runIntegration || runIntegration;
  const attemptNumber = Number(runtime.attemptNumber || 1);
  const maxReceiveCount = Number(runtime.maxReceiveCount || process.env.AUTOMATION_MAX_RECEIVE_COUNT || 3);
  let finalizationStore = runtime.finalizationStore || null;
  let deliveredResult;
  let finalizationState;

  logger.info('Priority order to ITC execution started.', {
    ...details,
    status: 'running',
    startedAt,
    recordsRead: job.payload ? 1 : 0,
    attemptNumber,
  });

  try {
    if (liveMode && !finalizationStore) finalizationStore = createFinalizationStore();
    const priorFinalization = liveMode ? await finalizationStore.load(jobId) : null;
    finalizationState = priorFinalization?.state;
    if (priorFinalization?.state === 'SUCCESS') {
      try {
        await statusReporter(job, 'success', {
          finishedAt: priorFinalization.finishedAt,
          outputPayload: priorFinalization.result,
        });
      } catch (error) {
        error.finalizationPending = true;
        error.retryable = true;
        throw error;
      }
      logger.info('Updated dashboard execution status from durable finalization.', {
        ...details,
        status: 'success',
        finalizationOnly: true,
      });
      logger.info('Priority order to ITC execution finalized without resending.', {
        ...details,
        status: 'success',
        finishedAt: priorFinalization.finishedAt,
        idempotentSkip: true,
        recordsRead: 0,
        messagesSent: 0,
        recordsSkipped: 1,
        errors: 0,
      });
      return priorFinalization.result || { success: true, idempotentSkip: true };
    }
    if (priorFinalization?.state === 'FAILED') {
      try {
        await statusReporter(job, 'failed', {
          finishedAt: priorFinalization.finishedAt,
          errorMessage: priorFinalization.errorMessage,
        });
      } catch (error) {
        error.finalizationPending = true;
        error.retryable = true;
        throw error;
      }
      logger.info('Updated dashboard execution status from durable finalization.', {
        ...details,
        status: 'failed',
        finalizationOnly: true,
      });
      logger.error('Priority order to ITC terminal failure finalized without resending.', {
        ...details,
        status: 'failed',
        finishedAt: priorFinalization.finishedAt,
        finalizationOnly: true,
        recordsRead: 0,
        messagesSent: 0,
        recordsSkipped: 1,
        errors: 1,
      });
      return { success: false, terminalFailure: true, finalizationOnly: true };
    }
    if (priorFinalization?.state === 'IN_FLIGHT') {
      const ambiguousMessage = 'A previous worker stopped after reserving provider delivery. ITC delivery status is unknown, so the message was not resent automatically. Reconcile the recipient/provider status, then replay as a new test or live execution only if needed.';
      try {
        await statusReporter(job, 'failed', {
          finishedAt: new Date().toISOString(),
          errorMessage: ambiguousMessage,
        });
      } catch (error) {
        error.finalizationPending = true;
        error.retryable = true;
        throw error;
      }
      logger.error('Ambiguous provider delivery blocked automatic resend.', {
        ...details,
        status: 'failed',
        deliveryState: 'ambiguous_in_flight',
        inFlightStartedAt: priorFinalization.startedAt,
        finishedAt: new Date().toISOString(),
        recordsRead: 0,
        messagesSent: 0,
        recordsSkipped: 1,
        errors: 1,
      });
      return {
        success: false,
        ambiguousDelivery: true,
        automaticResendSuppressed: true,
        message: ambiguousMessage,
      };
    }

    let claim = await statusReporter(job, 'running', { startedAt });
    if (claim?.alreadyCompleted) {
      logger.info('Priority order to ITC execution skipped as already completed.', {
        ...details,
        status: 'success',
        finishedAt: new Date().toISOString(),
        idempotentSkip: true,
        recordsRead: 0,
        messagesSent: 0,
        recordsSkipped: 1,
        errors: 0,
      });
      return { success: true, skipped: true, idempotentSkip: true };
    }
    if (claim?.accepted === false && claim?.inProgress && attemptNumber > 1) {
      await statusReporter(job, 'retrying', {
        errorMessage: 'Recovering a previous worker attempt that ended before finalization.',
      });
      claim = await statusReporter(job, 'running', { startedAt: new Date().toISOString() });
    }
    if (claim?.accepted === false) {
      const error = new Error('This execution is already being processed by another worker.');
      error.retryable = true;
      throw error;
    }

    const context = {
      logger,
      config: await configResolver(job),
      mocks: job.mocks || {},
      beforeProviderDelivery: liveMode
        ? async () => {
            await finalizationStore.saveInFlight(jobId, new Date().toISOString());
            finalizationState = 'IN_FLIGHT';
            logger.info('Stored provider delivery in-flight marker.', {
              ...details,
              status: 'running',
              finalizationState: 'IN_FLIGHT',
            });
          }
        : undefined,
    };
    const result = await integrationRunner(job, context);
    deliveredResult = result;
    const finishedAt = new Date().toISOString();
    if (liveMode) {
      await finalizationStore.saveSuccess(jobId, result, finishedAt);
      logger.info('Stored ITC finalization state.', {
        ...details,
        status: 'success',
        finalizationState: 'SUCCESS',
        finishedAt,
      });
    }

    try {
      await statusReporter(job, 'success', { finishedAt, outputPayload: result });
      logger.info('Updated dashboard execution status.', { ...details, status: 'success', finishedAt });
    } catch (error) {
      if (liveMode) error.finalizationPending = true;
      error.retryable = true;
      throw error;
    }

    logger.info('Priority order to ITC execution finished successfully.', {
      ...details,
      status: 'success',
      finishedAt,
      ...(result.counts || {}),
    });
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();

    if (error.finalizationPending) {
      logger.error('Provider work completed but dashboard finalization must be retried without resending.', {
        ...details,
        ...normalizeError(error),
        status: 'retrying',
        finalizationOnly: true,
        finishedAt,
        recordsRead: job.payload ? 1 : 0,
        messagesSent: deliveredResult || finalizationState === 'SUCCESS' ? 1 : 0,
        recordsSkipped: 0,
        errors: 1,
      });
      error.retryable = true;
      throw error;
    }

    if (deliveredResult) {
      // ITC accepted the request but the durable finalization store itself failed.
      // Never resend an accepted message merely to repair dashboard state.
      await statusReporter(job, 'success', { finishedAt, outputPayload: deliveredResult }).catch(() => {});
      const noResendError = new Error('ITC accepted the message, but durable execution finalization could not be recorded. The message will not be resent automatically.');
      noResendError.retryable = false;
      logger.error('ITC delivery accepted; automatic resend suppressed because finalization storage failed.', {
        ...details,
        status: 'failed',
        deliveryState: 'accepted_finalization_unconfirmed',
        finishedAt,
        recordsRead: 1,
        messagesSent: 1,
        recordsSkipped: 0,
        errors: 1,
      });
      throw noResendError;
    }

    if (liveMode && finalizationState === 'IN_FLIGHT' && error.deliveryAmbiguous === true) {
      const ambiguousMessage = 'ITC returned an ambiguous delivery result. The message was not retried automatically. Reconcile the recipient/provider status, then replay as a new execution only if needed.';
      try {
        await statusReporter(job, 'failed', { finishedAt, errorMessage: ambiguousMessage });
      } catch (callbackError) {
        callbackError.finalizationPending = true;
        callbackError.retryable = true;
        throw callbackError;
      }
      logger.error('Ambiguous ITC response blocked automatic resend.', {
        ...details,
        ...normalizeError(error),
        providerError: error.providerError,
        status: 'failed',
        deliveryState: 'ambiguous_in_flight',
        finishedAt,
        recordsRead: job.payload ? 1 : 0,
        messagesSent: 0,
        recordsSkipped: 1,
        errors: 1,
      });
      error.retryable = false;
      throw error;
    }

    const retryableFailure = shouldRetry(error);
    if (retryableFailure && attemptNumber < maxReceiveCount) {
      await statusReporter(job, 'retrying', { finishedAt, errorMessage: error.message }).catch(() => {});
      logger.error('Priority order to ITC execution will retry before any accepted delivery.', {
        ...details,
        ...normalizeError(error),
        providerError: error.providerError,
        status: 'retrying',
        finishedAt,
        recordsRead: job.payload ? 1 : 0,
        messagesSent: 0,
        recordsSkipped: 0,
        errors: 1,
      });
      error.retryable = true;
      throw error;
    }

    if (retryableFailure && attemptNumber >= maxReceiveCount) {
      error.sendToDlq = true;
      logger.error('Retry limit reached; execution will be finalized as failed before DLQ transfer.', {
        ...details,
        ...normalizeError(error),
        providerError: error.providerError,
        status: 'failed',
        attemptNumber,
        maxReceiveCount,
        finishedAt,
        recordsRead: job.payload ? 1 : 0,
        messagesSent: 0,
        recordsSkipped: 0,
        errors: 1,
      });
    }

    if (liveMode) {
      try {
        await finalizationStore.saveFailure(jobId, error.message, finishedAt);
        logger.info('Stored ITC finalization state.', {
          ...details,
          status: 'failed',
          finalizationState: 'FAILED',
          finishedAt,
        });
      } catch (storageError) {
        storageError.retryable = true;
        throw storageError;
      }
    }
    try {
      await statusReporter(job, 'failed', { finishedAt, errorMessage: error.message });
      logger.info('Updated dashboard execution status.', { ...details, status: 'failed', finishedAt });
    } catch (callbackError) {
      if (liveMode) callbackError.finalizationPending = true;
      callbackError.retryable = true;
      throw callbackError;
    }
    logger.error('Priority order to ITC execution failed.', {
      ...details,
      ...normalizeError(error),
      providerError: error.providerError,
      status: 'failed',
      finishedAt,
      recordsRead: job.payload ? 1 : 0,
      messagesSent: 0,
      recordsSkipped: 0,
      errors: 1,
    });
    error.retryable = false;
    throw error;
  }
}

async function handleEvent(event, runtimeFactory = () => ({})) {
  const isSqsEvent = Array.isArray(event?.Records);
  const records = isSqsEvent ? event.Records : [{ body: JSON.stringify(event), messageId: event?.id || 'direct' }];
  const results = [];
  const batchItemFailures = [];

  for (const record of records) {
    try {
      const job = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
      results.push(await processJob(job, record.messageId, {
        ...runtimeFactory(job, record),
        attemptNumber: Number(record.attributes?.ApproximateReceiveCount || 1),
      }));
    } catch (error) {
      results.push({
        success: false,
        retryable: error.retryable === true,
        sendToDlq: error.sendToDlq === true,
        error: error.message,
      });
      if (!isSqsEvent) throw error;
      if (error.retryable === true || error.sendToDlq === true) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return isSqsEvent ? { batchItemFailures, results } : { success: true, results };
}

export async function handler(event) {
  return handleEvent(event);
}

export const _diagnostics = { handleEvent, processJob, shouldRetry };
