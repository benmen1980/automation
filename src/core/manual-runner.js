const executionService = require('./execution-service');
const { enqueueExecution } = require('./queue');
const integrationLoader = require('./integration-loader');
const { canonicalizeExecutionPayload } = require('./execution-privacy');

function assertExecutionModeAllowed(integration, executionMode) {
  const definition = integrationLoader.loadDefinition(integration, { bypassCache: true });
  const allowedModes = Array.isArray(definition?.testing?.modes) ? definition.testing.modes : [];
  if (typeof executionMode !== 'string' || !allowedModes.includes(executionMode)) {
    const error = new Error(`Unsupported execution mode. Allowed modes: ${allowedModes.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
  return definition;
}

async function createAndEnqueue({ integration, triggerType, executionMode = 'test', payload = {}, sourceExecutionId, wait = true }) {
  const definition = assertExecutionModeAllowed(integration, executionMode);
  const canonicalPayload = canonicalizeExecutionPayload(definition, payload ?? {});
  const execution = await executionService.createExecution({
    userId: integration.userId,
    integrationId: integration.id,
    triggerType,
    executionMode,
    inputPayload: canonicalPayload,
    sourceExecutionId,
  });
  return enqueueExecution(execution.id, { wait });
}

async function runManual({ integration, executionMode = 'test', payload = {}, wait = true }) {
  return createAndEnqueue({ integration, triggerType: 'manual', executionMode, payload, wait });
}

async function replayExecution({ sourceExecution, integration, executionMode = 'test', wait = true }) {
  const payload = sourceExecution.inputPayload ? JSON.parse(sourceExecution.inputPayload) : {};
  return createAndEnqueue({
    integration,
    triggerType: 'manual',
    executionMode,
    payload,
    sourceExecutionId: sourceExecution.id,
    wait,
  });
}

module.exports = { runManual, replayExecution, createAndEnqueue, assertExecutionModeAllowed };
