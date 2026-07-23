const integrationLoader = require('./integration-loader');

const REDACTED_PERSONAL_VALUE = Object.freeze({
  type: 'redacted',
  reason: 'sensitive personal data',
});

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function redactPath(target, pathExpression) {
  const segments = String(pathExpression || '').split('.').filter(Boolean);
  if (segments.length === 0) return;
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!current || typeof current !== 'object') return;
    current = current[segment];
  }
  const finalKey = segments[segments.length - 1];
  if (current && typeof current === 'object' && current[finalKey] !== undefined) {
    current[finalKey] = { ...REDACTED_PERSONAL_VALUE };
  }
}

function readPath(source, pathExpression) {
  const segments = String(pathExpression || '').split('.').filter(Boolean);
  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function writePath(target, pathExpression, value) {
  const segments = String(pathExpression || '').split('.').filter(Boolean);
  if (segments.length === 0) return;
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    current = current[segment];
  }
  current[segments[segments.length - 1]] = cloneJson(value);
}

function canonicalizeExecutionPayload(definition, payload) {
  const allowlistPaths = definition?.privacy?.executionPayloadAllowlistPaths;
  if (!Array.isArray(allowlistPaths) || allowlistPaths.length === 0) return payload;
  const canonicalPayload = {};
  for (const pathExpression of allowlistPaths) {
    const value = readPath(payload, pathExpression);
    if (value !== undefined) writePath(canonicalPayload, pathExpression, value);
  }
  return canonicalPayload;
}

function redactPayload(definition, payload) {
  const redactionPaths = definition?.privacy?.executionPayloadRedactionPaths;
  if (!Array.isArray(redactionPaths) || redactionPaths.length === 0) return payload;
  const safePayload = cloneJson(payload);
  for (const pathExpression of redactionPaths) redactPath(safePayload, pathExpression);
  return safePayload;
}

function redactExecutionForDisplay(integration, execution) {
  if (!execution || !integration || !execution.inputPayload) return execution;
  const definition = integrationLoader.loadDefinition(integration, { bypassCache: true });
  const redactionPaths = definition?.privacy?.executionPayloadRedactionPaths;
  if (!Array.isArray(redactionPaths) || redactionPaths.length === 0) return execution;

  let payload;
  try {
    payload = JSON.parse(execution.inputPayload);
  } catch {
    return { ...execution, inputPayload: JSON.stringify({ type: 'redacted', reason: 'unparseable sensitive input' }) };
  }

  return {
    ...execution,
    inputPayload: JSON.stringify(redactPayload(definition, payload)),
  };
}

module.exports = {
  REDACTED_PERSONAL_VALUE,
  canonicalizeExecutionPayload,
  redactExecutionForDisplay,
  redactPath,
  redactPayload,
};
