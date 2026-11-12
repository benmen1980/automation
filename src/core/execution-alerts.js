const crypto = require('crypto');
const prisma = require('../db/client');
const { sanitizeLogEntry } = require('../utils/sanitize-logs');
const { createNotificationService } = require('./notification-recipients');
const notifications = createNotificationService({ db: prisma });

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
  if (!require('./deployment-safety').emailSendingEnabled()) return { status: 'disabled' };
  let execution;
  try {
    execution = await prisma.execution.findUnique({ where: { id: executionId }, include: { integration: true } });
    if (!execution) return { status: 'unavailable' };
    attempt = attempt || execution.retryCount + 1;
    return await notifications.notifyFailure(execution.integration, error, {
      executionId, attempt, stage, occurredAt: execution.finishedAt || new Date(),
    });
  } catch (err) {
    if (execution) await record(execution, attempt, 'failed', 'Failure notification failed (delivery may be unknown).', { error: err.message }).catch(() => {});
    return { status: 'failed' };
  }
}

module.exports = { collectExecutionLogs, notifyExecutionFailure, record, key };
