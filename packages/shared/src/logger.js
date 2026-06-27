const REDACTED = '***REDACTED***';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[-_]?key|api_key|authorization|auth|credential|connection[-_]?string|private[-_]?key)/i;

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

function safeMeta(metadata = {}) {
  return JSON.parse(JSON.stringify(metadata, (_key, value) => {
    if (SENSITIVE_KEY_PATTERN.test(_key)) return REDACTED;
    if (typeof value === 'string') {
      const sanitized = sanitizeString(value);
      if (sanitized.length > 160) return `${sanitized.slice(0, 157)}...`;
      return sanitized;
    }
    return value;
  }));
}

export function createLogger({ service = 'integration', jobId = 'local' } = {}) {
  const write = (level, message, metadata) => {
    const entry = {
      time: new Date().toISOString(),
      level,
      service,
      jobId,
      message: sanitizeString(message),
      metadata: safeMeta(metadata),
    };
    console.log(JSON.stringify(entry));
  };

  return {
    debug: (message, metadata) => write('debug', message, metadata),
    info: (message, metadata) => write('info', message, metadata),
    warn: (message, metadata) => write('warn', message, metadata),
    error: (message, metadata) => write('error', message, metadata),
  };
}
