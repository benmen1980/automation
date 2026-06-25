/**
 * Redacts likely-secret values before they are persisted to the Log table
 * or printed to the console. Per docs/product/product-architecture-spec.md section 10.4, logs must never
 * expose passwords, API keys, tokens, authorization headers, or connection
 * strings.
 *
 * This is a defense-in-depth measure, not a replacement for never logging
 * `credentials` objects wholesale.
 */
const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[-_]?key|authorization|auth|credential|connection[-_]?string|private[-_]?key)/i;

const REDACTED = '[REDACTED]';

function sanitizeValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Redact things that look like bearer tokens or long opaque secrets.
    if (/^Bearer\s+\S+/i.test(value)) return 'Bearer [REDACTED]';
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = sanitizeValue(val, seen);
      }
    }
    return out;
  }

  return value;
}

/**
 * Sanitizes a log message + metadata pair for safe persistence.
 */
function sanitizeLogEntry({ message, metadata }) {
  let safeMessage = message;
  if (typeof safeMessage === 'string' && SENSITIVE_KEY_PATTERN.test(safeMessage)) {
    // Don't redact the whole message just because a sensitive word appears
    // (e.g. "Validating WHATSAPP_TOKEN" is fine) — only strip obvious
    // key=value or Bearer-style leaks.
    safeMessage = safeMessage
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:token|key|secret|password)=)([^&\s]+)/gi, `$1${REDACTED}`);
  }

  return {
    message: safeMessage,
    metadata: metadata === undefined ? undefined : sanitizeValue(metadata),
  };
}

module.exports = { sanitizeLogEntry, sanitizeValue, SENSITIVE_KEY_PATTERN };
