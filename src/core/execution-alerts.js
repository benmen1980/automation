const crypto = require('crypto');
const prisma = require('../db/client');
const loader = require('./integration-loader');
const { sanitizeLogEntry, sanitizeValue } = require('../utils/sanitize-logs');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const sender = 'roy@simplyct.co.il';
const ses = new SESv2Client({ region: 'eu-west-1', maxAttempts: 1 });
const key = (executionId, attempt, kind) => 'alert_' + crypto.createHash('sha256')
  .update(JSON.stringify([executionId, attempt, kind])).digest('hex');

async function record(execution, attempt, kind, message, metadata, id) {
  const safe = sanitizeLogEntry({ message, metadata });
  return prisma.log.create({ data: {
    ...(id ? { id } : {}), userId: execution.userId, integrationId: execution.integrationId,
    executionId: execution.id, executionMode: execution.executionMode,
    isTest: execution.executionMode !== 'live', attempt, correlationId: execution.id,
    eventType: `automation.alert.${kind}`, level: kind === 'failed' ? 'error' : 'info',
    message: safe.message, metadata: JSON.stringify(safe.metadata ?? {}),
  } });
}

// No take/limit, and no sourceExecutionId traversal: retries share an execution ID;
// manual replays are separate runs and must never leak into this snapshot.
async function collectExecutionLogs(executionId, { integrationId, through = new Date() } = {}) {
  if (!integrationId) throw new Error('integrationId is required.');
  const logs = await prisma.log.findMany({
    where: { executionId, integrationId, createdAt: { lte: through } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return logs.map((log) => {
    let metadata = log.metadata;
    try { metadata = JSON.parse(metadata); } catch { /* Legacy plain text. */ }
    return { ...log, ...sanitizeLogEntry({ message: log.message, metadata }) };
  });
}

// This boundary NEVER throws into business execution or retries a send with an
// ambiguous SES outcome. The durable claim is deliberately retained on failure.
async function notifyExecutionFailure(executionId, error, { attempt, stage = 'execution' } = {}) {
  let execution;
  try {
    execution = await prisma.execution.findUnique({ where: { id: executionId }, include: { integration: true } });
    if (!execution) return { status: 'unavailable' };
    attempt = attempt || execution.retryCount + 1;
    const adapter = loader.loadDefinition(execution.integration).failureNotification;
    if (!adapter) return { status: 'disabled' };
    try {
      await record(execution, attempt, 'claimed', 'Failure notification claimed.', { stage, error: error?.message || String(error) }, key(executionId, attempt, 'claim'));
    } catch (err) {
      if (err.code === 'P2002') return { status: 'duplicate' };
      throw err;
    }
    const setting = await prisma.credential.findUnique({ where: {
      integrationId_key: { integrationId: execution.integrationId, key: adapter.recipientsKey },
    } });
    if (setting?.isSecret) throw new Error('Notification recipients must be a non-secret automation setting.');
    const recipients = await adapter.resolveRecipients(setting ? JSON.parse(setting.valueReference) : undefined);
    if (!Array.isArray(recipients)) throw new Error('resolveRecipients must return an array.');
    if (!recipients.length) {
      await record(execution, attempt, 'skipped', 'Failure notification skipped: no recipients.', { stage });
      return { status: 'skipped' };
    }
    await record(execution, attempt, 'started', 'Failure notification sending started.', { stage });
    const through = new Date();
    const logs = await collectExecutionLogs(executionId, { integrationId: execution.integrationId, through });
    const message = await adapter.buildMessage({ execution: sanitizeValue(execution), attempt, stage,
      error: sanitizeValue({ name: error?.name, message: error?.message || String(error), stack: error?.stack }), logs, through });
    const response = await ses.send(new SendEmailCommand({
      FromEmailAddress: sender, FeedbackForwardingEmailAddress: sender,
      Destination: { ToAddresses: recipients },
      Content: { Simple: { Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: message.text, Charset: 'UTF-8' } } } },
    }), { abortSignal: AbortSignal.timeout(15000) });
    await record(execution, attempt, 'accepted', 'SES accepted the failure notification request.', { messageId: response.MessageId });
    return { status: 'accepted', messageId: response.MessageId };
  } catch (err) {
    if (execution) await record(execution, attempt, 'failed', 'Failure notification failed (delivery may be unknown).', { error: err.message }).catch(() => {});
    return { status: 'failed' };
  }
}

module.exports = { collectExecutionLogs, notifyExecutionFailure, record, key };
