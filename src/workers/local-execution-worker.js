require('dotenv').config();
const path = require('path');
const { pathToFileURL } = require('url');
const { runExecutionJob } = require('../core/execution-runner');
const executionService = require('../core/execution-service');
const credentialsService = require('../core/credentials');
const { createLogger } = require('../core/logger');
const { summarizePayload } = require('../utils/payload-summary');
const {
  copyPriorityDocumentFromUrl,
} = require('../core/priority-document-store');
const integrationLoader = require('../core/integration-loader');
const prisma = require('../db/client');

const INDEPENDENT_LOCAL_WORKERS = new Map([
  ['int_7f9a2c8e4b1d6f03', 'priority-order-itc'],
]);

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createTrackedLogger(logger) {
  const pending = [];
  const tracked = {};
  for (const method of ['debug', 'info', 'warning', 'warn', 'error']) {
    if (typeof logger[method] !== 'function') continue;
    tracked[method] = (...args) => {
      const task = Promise.resolve()
        .then(() => logger[method](...args))
        .then(
          () => ({ status: 'fulfilled' }),
          () => ({ status: 'rejected' })
        );
      pending.push(task);
      return task;
    };
  }
  tracked.flush = async () => {
    const tasks = pending.splice(0, pending.length);
    if (!tasks.length) return;
    const outcomes = await Promise.all(tasks);
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      const error = new Error('One or more integration log entries could not be persisted.');
      error.name = 'IntegrationLogFlushError';
      throw error;
    }
  };
  return tracked;
}

async function runIndependentLocalWorker(execution, workerName, overrides = {}) {
  const { integration, user } = execution;
  const payload = parseJson(execution.inputPayload);
  const executionStore = overrides.executionService || executionService;
  const logger = overrides.logger || createLogger({
    userId: execution.userId,
    integrationId: execution.integrationId,
    executionId: execution.id,
    executionMode: execution.executionMode,
    isTest: execution.executionMode !== 'live',
  });
  const integrationLogger = createTrackedLogger(logger);

  try {
    await executionStore.markRunning(execution.id);
    await logger.info('Independent local integration worker started.', {
      integrationName: integration.name,
      integrationSlug: integration.slug,
      workerName,
      jobId: execution.id,
      triggerType: execution.triggerType,
      executionMode: execution.executionMode,
      status: 'running',
      startedAt: new Date().toISOString(),
      requestPayloadSummary: summarizePayload(payload),
    });

    const credentials = overrides.credentials === undefined
      ? await credentialsService.loadCredentialsForExecution(integration)
      : overrides.credentials;
    let handler = overrides.handler;
    if (!handler) {
      const handlerUrl = pathToFileURL(
        path.join(process.cwd(), 'integrations', workerName, 'src', 'handler.js')
      ).href;
      ({ handler } = await import(handlerUrl));
    }
    if (typeof handler !== 'function') {
      throw new Error(`Independent worker "${workerName}" does not export handler(job, context).`);
    }

    const result = await handler(
      {
        id: execution.id,
        executionId: execution.id,
        integrationId: integration.id,
        integrationName: integration.name,
        integrationSlug: integration.slug,
        userId: user.id,
        userSlug: user.slug,
        triggerType: execution.triggerType,
        mode: execution.executionMode,
        executionMode: execution.executionMode,
        payload,
      },
      {
        logger: integrationLogger,
        config: { credentials },
        mocks: {},
        archiveDocument: async (sourceUrl) => {
          const stored = await copyPriorityDocumentFromUrl(execution.id, sourceUrl);
          return stored.documentUrl;
        },
      }
    );

    await integrationLogger.flush();
    await executionStore.markSuccess(execution.id, result);
    await logger.info('Independent local integration worker finished successfully.', {
      integrationName: integration.name,
      integrationSlug: integration.slug,
      workerName,
      jobId: execution.id,
      triggerType: execution.triggerType,
      executionMode: execution.executionMode,
      status: 'success',
      endedAt: new Date().toISOString(),
      responsePayloadSummary: summarizePayload(result),
      ...(result?.counts || {}),
    });
  } catch (error) {
    let logPersistenceError = null;
    try {
      await integrationLogger.flush();
    } catch (flushError) {
      logPersistenceError = flushError;
    }

    await executionStore.markFailed(execution.id, error.message);
    try {
      await logger.error('Independent local integration worker failed.', {
        integrationName: integration.name,
        integrationSlug: integration.slug,
        workerName,
        jobId: execution.id,
        triggerType: execution.triggerType,
        executionMode: execution.executionMode,
        status: 'failed',
        endedAt: new Date().toISOString(),
        error: error.message,
        errorName: error.name,
        providerError: error.providerError,
        logPersistenceError: logPersistenceError
          ? {
              name: logPersistenceError.name,
              message: 'One or more integration log entries could not be persisted.',
            }
          : undefined,
        recordsRead: payload && Object.keys(payload).length ? 1 : 0,
        messagesSent: 0,
        errors: 1,
      });
    } catch {
      // The execution is already finalized as failed; a final log write must not
      // replace the provider error or leave the dashboard status in "running".
    }
  }

  return executionStore.getExecutionById(execution.id);
}

async function main() {
  const executionId = process.argv[2];
  if (!executionId) {
    throw new Error('Usage: node src/workers/local-execution-worker.js <executionId>');
  }

  const queuedExecution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { integration: true, user: true },
  });
  if (!queuedExecution) throw new Error(`Execution not found: ${executionId}`);

  let integrationKey = queuedExecution.integrationId;
  try {
    integrationKey = integrationLoader.loadDefinition(queuedExecution.integration, { bypassCache: true })?.integrationKey || integrationKey;
  } catch {
    integrationKey = queuedExecution.integrationId;
  }
  const workerName =
    INDEPENDENT_LOCAL_WORKERS.get(integrationKey);
  const execution = workerName
    ? await runIndependentLocalWorker(queuedExecution, workerName)
    : await runExecutionJob(executionId);
  process.stdout.write(JSON.stringify({ executionId, status: execution.status }));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  INDEPENDENT_LOCAL_WORKERS,
  createTrackedLogger,
  runIndependentLocalWorker,
};
