const { sanitizeValue } = require('./sanitize-logs');

const MAX_STRING_LENGTH = 120;
const MAX_KEYS = 12;
const MAX_ARRAY_ITEMS = 5;
const PERSONAL_DATA_KEY_PATTERN = /(email|e[-_]?mail|phone|mobile|tel|address|street|city|zip|postal|name|first[-_]?name|last[-_]?name|message|body|note|comment|description|customer|contact)/i;

function summarizeString(value) {
  return value.length > MAX_STRING_LENGTH
    ? { type: 'string', length: value.length, preview: `${value.slice(0, MAX_STRING_LENGTH)}...` }
    : value;
}

function summarizePayload(value, depth = 0, keyName = '') {
  const safeValue = sanitizeValue(value);

  if (safeValue === null || safeValue === undefined) return safeValue;
  if (keyName && PERSONAL_DATA_KEY_PATTERN.test(keyName)) {
    if (typeof safeValue === 'string') return { type: 'redacted', reason: 'sensitive personal data' };
    if (Array.isArray(safeValue)) return { type: 'array', length: safeValue.length, redacted: true };
    if (typeof safeValue === 'object') return { type: 'object', keys: Object.keys(safeValue), redacted: true };
    return '***REDACTED***';
  }
  if (typeof safeValue === 'string') {
    return summarizeString(safeValue);
  }
  if (typeof safeValue !== 'object') return safeValue;
  if (depth >= 2) {
    return Array.isArray(safeValue)
      ? { type: 'array', length: safeValue.length }
      : { type: 'object', keys: Object.keys(safeValue).slice(0, MAX_KEYS) };
  }

  if (Array.isArray(safeValue)) {
    return {
      type: 'array',
      length: safeValue.length,
      sample: safeValue.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizePayload(item, depth + 1, keyName)),
    };
  }

  const entries = Object.entries(safeValue);
  const summary = {};
  for (const [key, item] of entries.slice(0, MAX_KEYS)) {
    summary[key] = summarizePayload(item, depth + 1, key);
  }
  if (entries.length > MAX_KEYS) {
    summary.__omittedKeys = entries.length - MAX_KEYS;
  }
  return summary;
}

module.exports = { summarizePayload };
