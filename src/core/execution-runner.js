/**
 * Execution engine. Trigger paths create an Execution row, then either run
 * it directly or hand the execution id to an isolated local/AWS worker.
 */
const prisma = require('../db/client');
const executionService = require('./execution-service');
const credentialsService = require('./credentials');
const integrationLoader = require('./integration-loader');
const { createLogger } = require('./logger');
const { getConnectors } = require('../connectors');
const { summarizePayload } = require('../utils/payload-summary');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function runExecutionJob(executionId) {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { integration: true, user: true },
  });

  if (!execution) throw new Error(`Execution not found: ${executionId}`);
  const { integration, user } = execution;
  const payload = parseJson(execution.inputPayload, {});
  const isTest = execution.executionMode !== 'live';

  const logger = createLogger({
    userId: integration.userId,
    integrationId: integration.id,
    executionId: execution.id,
    executionMode: execution.executionMode,
    isTest,
  });

  try {
    await executionService.markRunning(execution.id);
    await logger.info('Execution started.', {
      integrationName: integration.name,
      integrationSlug: integration.slug,
      jobId: execution.id,
      triggerType: execution.triggerType,
      executionMode: execution.executionMode,
      status: 'running',
      startedAt: new Date().toISOString(),
      sourceExecutionId: execution.sourceExecutionId || undefined,
      requestPayloadSummary: summarizePayload(payload),
    });

    if (integration.status !== 'active') {
      throw new Error(`Integration "${integration.slug}" is not active.`);
    }

    const credentials = await credentialsService.loadCredentialsForExecution(integration);
    credentials.__USER_SLUG = user.slug;
    const handler = integrationLoader.loadHandler(integration, { bypassCache: true });
    const connectors = getConnectors({ executionMode: execution.executionMode, credentials, logger });

    const result = await handler.execute({
      payload,
      credentials,
      user: { id: user.id, slug: user.slug, email: user.email, role: user.role },
      integration: { id: integration.id, name: integration.name, slug: integration.slug, type: integration.type },
      logger,
      connectors,
      executionMode: execution.executionMode,
    });

    await executionService.markSuccess(execution.id, result);
    await logger.info('Execution finished successfully.', {
      integrationName: integration.name,
      integrationSlug: integration.slug,
      jobId: execution.id,
      triggerType: execution.triggerType,
      executionMode: execution.executionMode,
      status: 'success',
      endedAt: new Date().toISOString(),
      responsePayloadSummary: summarizePayload(result),
    });
  } catch (err) {
    const failureDetails = {
      error: err.message,
      errorName: err.name,
      stack: err.stack,
      integrationName: integration.name,
      integrationSlug: integration.slug,
      jobId: execution.id,
      triggerType: execution.triggerType,
      executionMode: execution.executionMode,
      status: 'failed',
      endedAt: new Date().toISOString(),
      requestPayloadSummary: summarizePayload(payload),
      responsePayloadSummary: err.providerError ? summarizePayload(err.providerError) : undefined,
      integration: {
        id: integration.id,
        name: integration.name,
        slug: integration.slug,
        type: integration.type,
      },
      executionId: execution.id,
    };
    await executionService.markFailed(execution.id, err.message);
    await logger.error('Execution failed.', failureDetails);
  }

  return executionService.getExecutionById(execution.id);
}

async function runExecution({ integration, user, triggerType, executionMode, payload, sourceExecutionId }) {
  const execution = await executionService.createExecution({
    userId: integration.userId,
    integrationId: integration.id,
    triggerType,
    executionMode,
    inputPayload: payload ?? {},
    sourceExecutionId,
  });

  return runExecutionJob(execution.id);
}

module.exports = { runExecution, runExecutionJob };
