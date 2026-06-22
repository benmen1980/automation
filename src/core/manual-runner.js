/**
 * Dashboard-triggered manual runs for both webhook and scheduled
 * integrations ("Run Test" / "Run Now", CLAUDE.md 8.7), plus replay
 * (9.6). Both funnel through execution-runner.runExecution so they create
 * real execution + log records exactly like live triggers do.
 */
const { runExecution } = require('./execution-runner');

async function runManual({ integration, user, executionMode = 'test', payload = {}, isTest = true }) {
  return runExecution({
    integration,
    user,
    triggerType: 'manual',
    executionMode,
    payload,
    isTest,
  });
}

/**
 * Replays a previous execution: copies its inputPayload into a NEW
 * execution linked via sourceExecutionId. Always runs as a test-ish mode
 * (defaults to 'test', but caller may force dry_run/mock_output) so a
 * replay never silently re-sends a real message unless explicitly asked.
 */
async function replayExecution({ sourceExecution, integration, user, executionMode = 'test' }) {
  const payload = sourceExecution.inputPayload ? JSON.parse(sourceExecution.inputPayload) : {};
  return runExecution({
    integration,
    user,
    triggerType: 'manual',
    executionMode,
    payload,
    sourceExecutionId: sourceExecution.id,
    isTest: true,
  });
}

module.exports = { runManual, replayExecution };
