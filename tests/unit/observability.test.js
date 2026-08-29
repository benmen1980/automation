const {
  OBSERVABILITY_SCHEMA_VERSION,
  createCorrelationId,
  normalizeObservabilityContext,
  assertKnownEventType,
} = require('../../src/core/observability');

describe('typed automation observability', () => {
  test('creates stable-shaped correlation context without exposing payloads', () => {
    const correlationId = createCorrelationId();
    const context = normalizeObservabilityContext({
      eventType: 'automation.execution.completed',
      correlationId,
      durationMs: 12.7,
      attempt: 2,
      statusCode: 200,
    });

    expect(context).toEqual({
      eventType: 'automation.execution.completed',
      schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
      correlationId,
      durationMs: 13,
      attempt: 2,
      statusCode: 200,
    });
    expect(JSON.stringify(context)).not.toContain('payload');
  });

  test('falls back safely for unknown event types and rejects them explicitly when required', () => {
    expect(normalizeObservabilityContext({ eventType: 'provider.secret.value' }).eventType).toBe('automation.log');
    expect(() => assertKnownEventType('provider.secret.value')).toThrow('Unknown observability event type');
  });
});
