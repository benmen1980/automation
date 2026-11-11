const recipientsKey = 'ERROR_NOTIFICATION_EMAILS';
const address = '[^\\s@,;<>]+@[^\\s@,;<>]+\\.[^\\s@,;<>]+';
const recipientsPattern = `^\\s*(?:${address}(?:\\s*,\\s*${address})*)?\\s*$`;

function resolveRecipients(value) {
  if (value == null || String(value).trim() === '') return [];
  if (typeof value !== 'string' || !new RegExp(recipientsPattern).test(value)) {
    throw new Error('Enter valid email addresses separated by commas.');
  }
  return [...new Set(value.split(',').map((item) => item.trim().toLowerCase()))];
}

function timestamp(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString();
}

function buildMessage({ execution, attempt, stage, error, logs, through }) {
  const currentLogs = logs.filter((log) => Number(log.attempt || log.metadata?.attemptNumber || 1) === Number(attempt));
  const failure = [...currentLogs].reverse().find((log) => log.level === 'error' && !String(log.eventType || '').startsWith('automation.alert.'));
  const detail = failure?.metadata || {};
  const failedStage = detail.providerError?.stage || detail.stage || stage || 'execution';
  const retryStatus = detail.status === 'retrying'
    ? 'A retry is scheduled.'
    : detail.status === 'failed' || execution.status === 'failed'
      ? 'This attempt failed. No automatic retry is confirmed.'
      : 'Not confirmed. Check the execution log.';
  const text = [
    'An error occurred while running the Priority Order to ITC automation.',
    '',
    'Automation ID: int_7f9a2c8e4b1d6f03',
    `Run ID: ${execution.id}`,
    `Execution mode: ${execution.executionMode || 'Not recorded'}`,
    `Attempt: ${attempt}`,
    `Started at (UTC): ${timestamp(execution.startedAt) === 'Not recorded' ? timestamp(logs[0]?.createdAt) : timestamp(execution.startedAt)}`,
    `Error detected at (UTC): ${timestamp(failure?.createdAt || through)}`,
    '',
    `Failed stage: ${failedStage}`,
    `Error details: ${error?.message || String(error || 'Unknown error')}`,
    `Retry status: ${retryStatus}`,
    '',
    'Execution log',
    `All persisted log entries for this run through ${timestamp(through)} are included below, including previous attempts.`,
    'Sensitive values remain redacted. Original log messages retain their source language.',
    'If a process stopped unexpectedly, entries not saved before it stopped may be unavailable.',
    '',
    ...logs.map((log) => `${timestamp(log.createdAt)} [${log.level}] [Attempt ${log.attempt || log.metadata?.attemptNumber || 1}] ${log.message}${log.metadata == null ? '' : '\n' + JSON.stringify(log.metadata)}`),
    '',
    'This is an automated notification.',
  ].join('\n');
  return {
    subject: `[Automation Error] Priority Order to ITC | Run ${execution.id} | Attempt ${attempt}`,
    text,
  };
}

module.exports = { recipientsKey, recipientsPattern, resolveRecipients, buildMessage };
