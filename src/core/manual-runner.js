const executionService = require('./execution-service');
const { enqueueExecution } = require('./queue');

async function createAndEnqueue({ integration, triggerType, executionMode = 'test', payload = {}, sourceExecutionId, wait = true }) {
  const execution = await executionService.createExecution({
    userId: integration.userId,
    integrationId: integration.id,
    triggerType,
    executionMode,
    inputPayload: payload ?? {},
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

module.exports = { runManual, replayExecution, createAndEnqueue };
