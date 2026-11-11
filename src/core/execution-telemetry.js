const prisma = require('../db/client');
const { record, key, notifyExecutionFailure } = require('./execution-alerts');
const { sanitizeLogEntry } = require('../utils/sanitize-logs');

async function startAttempt(execution, attempt, timeoutMs) {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 86400000) {
    throw new Error('A positive attempt and timeoutMs (maximum 24 hours) are required.');
  }
  try {
    await record(execution, attempt, 'watching', 'Execution attempt watchdog registered.',
      { deadline: Date.now() + timeoutMs }, key(execution.id, attempt, 'watching'));
  } catch (err) { if (err.code !== 'P2002') throw err; }
}

async function appendLogs(execution, attempt, entries) {
  if (!Array.isArray(entries) || entries.length > 100) throw new Error('At most 100 log entries per batch.');
  for (const entry of entries) {
    if (!entry.id || !Number.isFinite(Date.parse(entry.time))) throw new Error('Log id and timestamp are required.');
    const safe = sanitizeLogEntry(entry);
    try {
      await prisma.log.create({ data: {
        id: key(execution.id, attempt, `worker:${entry.id}`), userId: execution.userId,
        integrationId: execution.integrationId, executionId: execution.id,
        executionMode: execution.executionMode, isTest: execution.executionMode !== 'live',
        correlationId: execution.id, attempt, createdAt: new Date(entry.time),
        level: ['info', 'debug', 'warning', 'error'].includes(entry.level) ? entry.level : 'info',
        message: safe.message, metadata: JSON.stringify(safe.metadata ?? {}),
      } });
    } catch (err) { if (err.code !== 'P2002') throw err; }
  }
}

async function finishAttempt(execution, attempt, error, stage = 'worker') {
  // Claims finalization across callback retries and watchdog instances.
  try {
    await record(execution, attempt, 'finished', error ? 'Execution attempt failed.' : 'Execution attempt completed.',
      { error: error?.message, stage }, key(execution.id, attempt, 'finished'));
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    const existing = await prisma.log.findUnique({ where: { id: key(execution.id, attempt, 'finished') } });
    const original = JSON.parse(existing.metadata);
    error = original.error ? new Error(original.error) : null;
    stage = original.stage;
  }
  if (error) return notifyExecutionFailure(execution.id, error, { attempt, stage });
  return { status: 'completed' };
}

async function reconcileExpiredAttempts(now = Date.now()) {
  const watches = await prisma.log.findMany({ where: { eventType: 'automation.alert.watching' } });
  for (const watch of watches) {
    if (JSON.parse(watch.metadata).deadline + 30000 > now) continue;
    const finished = await prisma.log.findUnique({ where: { id: key(watch.executionId, watch.attempt, 'finished') } });
    if (finished) continue;
    const execution = await prisma.execution.findUnique({ where: { id: watch.executionId } });
    if (!execution) continue;
    await finishAttempt(execution, watch.attempt,
      new Error('Worker deadline exceeded without a completion acknowledgement; crash, timeout or callback outage.'), 'watchdog');
  }
}

function startWatchdog() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await reconcileExpiredAttempts(); }
    catch (err) { console.error('[execution-watchdog] Reconciliation failed:', err.name); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  void tick();
  return timer;
}

module.exports = { startAttempt, appendLogs, finishAttempt, reconcileExpiredAttempts, startWatchdog };
