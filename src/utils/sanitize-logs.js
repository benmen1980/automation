/**
 * Redacts likely-secret values before they are persisted to the Log table
 * or printed to the console. Per docs/product/product-architecture-spec.md section 10.4, logs must never
 * expose passwords, API keys, tokens, authorization headers, or connection
 * strings.
 *
 * This is a defense-in-depth measure, not a replacement for never logging
 * `credentials` objects wholesale.
 */
const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[-_]?key|api_key|authorization|auth|credential|connection[-_]?string|private[-_]?key)/i;

const REDACTED = '***REDACTED***';

function sanitizeString(value) {
  return value
    .replace(/\bAuthorization\s*:\s*([^\r\n,}]+)/gi, (match, authValue) => {
      const scheme = String(authValue).trim().match(/^(Bearer|Basic|ApiKey)\b/i)?.[1];
      return scheme ? `Authorization: ${scheme} ${REDACTED}` : `Authorization: ${REDACTED}`;
    })
    .replace(/\b(X-API-Key|Api-Key|API-Key)\s*:\s*[^\r\n,}]+/gi, `$1: ${REDACTED}`)
    .replace(/"([^"]*(?:authorization|api[-_]?key|api_key|token|secret|password)[^"]*)"\s*:\s*"[^"]*"/gi, `"$1":"${REDACTED}"`)
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\b(Basic|ApiKey)\s+[A-Za-z0-9\-._~+/=:]+/gi, `$1 ${REDACTED}`)
    .replace(/((?:^|[?&\s])[^=&\s]*(?:token|key|secret|password|code)[^=&\s]*=)([^&\s]+)/gi, `$1${REDACTED}`)
    .replace(/(\b(?:password|secret|token|api[-_]?key|api_key|client_secret|access_token|refresh_token|authorization_code|code)\b\s*:\s*)([^\s&,}]+)/gi, `$1${REDACTED}`)
    .replace(/(\b(?:password|secret|token|api[-_]?key|api_key|client_secret|access_token|refresh_token|authorization_code)\b\s+)([^\s&,}]+)/gi, `$1${REDACTED}`);
}

function sanitizeValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeString(value);
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
  if (typeof safeMessage === 'string') {
    // Don't redact the whole message just because a sensitive word appears
    // (e.g. "Validating WHATSAPP_TOKEN" is fine) — only strip obvious
    // key=value or Bearer-style leaks.
    safeMessage = sanitizeString(safeMessage);
  }

  return {
    message: safeMessage,
    metadata: metadata === undefined ? undefined : sanitizeValue(metadata),
  };
}

module.exports = { sanitizeLogEntry, sanitizeValue, sanitizeString, SENSITIVE_KEY_PATTERN };
