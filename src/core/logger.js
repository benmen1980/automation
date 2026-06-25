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

const LOG_MODE = process.env.LOG_MODE || 'console';

function createLogger({ userId, integrationId, executionId, executionMode, isTest = false }) {
  async function write(level, message, metadata) {
    const safe = sanitizeLogEntry({ message, metadata });

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
        level,
        message: safe.message,
        metadata: safe.metadata !== undefined ? JSON.stringify(safe.metadata) : null,
        executionMode: executionMode || null,
        isTest,
      },
    });
  }

  return {
    debug: (message, metadata) => write('debug', message, metadata),
    info: (message, metadata) => write('info', message, metadata),
    warning: (message, metadata) => write('warning', message, metadata),
    error: (message, metadata) => write('error', message, metadata),
  };
}

module.exports = { createLogger };
