/**
 * The single engine that actually runs an integration's handler.js.
 * Every trigger path (webhook-runner, schedule-runner, manual-runner)
 * funnels through this function so behavior — execution records,
 * credential loading, connector mode selection, logging — is identical
 * regardless of how the run was triggered (CLAUDE.md 9.2).
 *
 * This function never throws for a *handler* failure — it always returns
 * the (now-finished) Execution row, with status 'success' or 'failed'.
 * It only throws for platform-level problems the caller should turn into
 * an HTTP error (e.g. webhook-runner's 404/401 checks happen before this
 * is called).
 */
const executionService = require('./execution-service');
const credentialsService = require('./credentials');
const integrationLoader = require('./integration-loader');
const { createLogger } = require('./logger');
const { getConnectors } = require('../connectors');

async function runExecution({ integration, user, triggerType, executionMode, payload, sourceExecutionId, isTest = false }) {
  const execution = await executionService.createExecution({
    userId: integration.userId,
    integrationId: integration.id,
    triggerType,
    executionMode,
    inputPayload: payload ?? {},
    sourceExecutionId,
  });

  const logger = createLogger({
    userId: integration.userId,
    integrationId: integration.id,
    executionId: execution.id,
    executionMode,
    isTest,
  });

  try {
    await executionService.markRunning(execution.id);
    await logger.info('Execution started.', { triggerType, executionMode, sourceExecutionId: sourceExecutionId || undefined });

    if (integration.status !== 'active') {
      throw new Error(`Integration "${integration.slug}" is not active.`);
    }

    const credentials = await credentialsService.loadCredentialsForExecution(integration);
    const handler = integrationLoader.loadHandler(integration);
    const connectors = getConnectors({ executionMode, credentials, logger });

    const result = await handler.execute({
      payload: payload ?? {},
      credentials,
      user,
      integration: { id: integration.id, name: integration.name, slug: integration.slug, type: integration.type },
      logger,
      connectors,
      executionMode,
    });

    await executionService.markSuccess(execution.id, result);
    await logger.info('Execution finished successfully.');
  } catch (err) {
    await executionService.markFailed(execution.id, err.message);
    await logger.error('Execution failed.', { error: err.message });
  }

  return executionService.getExecutionById(execution.id);
}

module.exports = { runExecution };
