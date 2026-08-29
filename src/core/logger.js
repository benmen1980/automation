/**
 * Logger injected into every handler.execute() call. Handlers must use
 * this instead of writing to the DB directly or calling console.* with
 * raw secret-bearing objects (docs/product/product-architecture-spec.md 5.5, 10.4).
 *
 * Every log line is persisted to the Log table, scoped to user +
 * integration + execution, and sanitized first.
 */
const prisma = require('../db/client');
const { sanitizeLogEntry } = require('../utils/sanitize-logs');
const { normalizeObservabilityContext } = require('./observability');

const LOG_MODE = process.env.LOG_MODE || 'console';

function createLogger({ userId, integrationId, automationId = null, executionId, executionMode, isTest = false, correlationId } = {}) {
  const defaultContext = normalizeObservabilityContext({ correlationId });

  async function write(level, message, metadata, context = {}) {
    const safe = sanitizeLogEntry({ message, metadata });
    const observability = normalizeObservabilityContext({ ...defaultContext, ...context });

    if (LOG_MODE === 'console') {
      const prefix = `[${level.toUpperCase()}] [${integrationId}] [${executionId || 'no-exec'}]`;
      // eslint-disable-next-line no-console
      console.log(prefix, safe.message, safe.metadata ? JSON.stringify(safe.metadata) : '');
    }

    await prisma.log.create({
      data: {
        userId,
        integrationId,
        executionId: executionId || null,
        automationId,
        level,
        message: safe.message,
        metadata: safe.metadata !== undefined ? JSON.stringify(safe.metadata) : null,
        executionMode: executionMode || null,
        isTest,
        eventType: observability.eventType,
        schemaVersion: observability.schemaVersion,
        correlationId: observability.correlationId,
        durationMs: observability.durationMs,
        attempt: observability.attempt,
        statusCode: observability.statusCode,
      },
    });
  }

  return {
    debug: (message, metadata, context) => write('debug', message, metadata, context),
    info: (message, metadata, context) => write('info', message, metadata, context),
    warning: (message, metadata, context) => write('warning', message, metadata, context),
    error: (message, metadata, context) => write('error', message, metadata, context),
  };
}

module.exports = { createLogger };
