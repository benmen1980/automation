const crypto = require('crypto');

const OBSERVABILITY_SCHEMA_VERSION = 1;
const EVENT_TYPES = new Set([
  'automation.execution.started',
  'automation.execution.completed',
  'automation.execution.failed',
  'automation.connector.checked',
  'automation.webhook.accepted',
  'automation.webhook.rejected',
  'automation.log',
]);

function createCorrelationId() {
  return crypto.randomUUID();
}

function normalizeObservabilityContext(input = {}) {
  const eventType = EVENT_TYPES.has(input.eventType) ? input.eventType : 'automation.log';
  return {
    eventType,
    schemaVersion: Number.isInteger(input.schemaVersion) ? input.schemaVersion : OBSERVABILITY_SCHEMA_VERSION,
    correlationId: input.correlationId || createCorrelationId(),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
    attempt: Number.isInteger(input.attempt) ? Math.max(1, input.attempt) : null,
    statusCode: Number.isInteger(input.statusCode) ? input.statusCode : null,
  };
}

function assertKnownEventType(eventType) {
  if (!EVENT_TYPES.has(eventType)) throw new Error(`Unknown observability event type: ${eventType}`);
  return eventType;
}

module.exports = {
  OBSERVABILITY_SCHEMA_VERSION,
  EVENT_TYPES,
  createCorrelationId,
  normalizeObservabilityContext,
  assertKnownEventType,
};
