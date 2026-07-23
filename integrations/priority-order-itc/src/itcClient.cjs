const DEFAULT_TIMEOUT_MS = 15000;

function sanitizeProviderString(value) {
  return String(value)
    .replace(/\bAuthorization\s*:\s*([^\r\n,}]+)/gi, (match, authValue) => {
      const scheme = String(authValue).trim().match(/^(Bearer|Basic|ApiKey)\b/i)?.[1];
      return scheme
        ? `Authorization: ${scheme} ***REDACTED***`
        : 'Authorization: ***REDACTED***';
    })
    .replace(/\b(X-API-Key|Api-Key|API-Key)\s*:\s*[^\r\n,}]+/gi, '$1: ***REDACTED***')
    .replace(
      /"([^"]*(?:authorization|api[-_]?key|api_key|token|secret|password)[^"]*)"\s*:\s*"[^"]*"/gi,
      '"$1":"***REDACTED***"'
    )
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***REDACTED***')
    .replace(/\b(Basic|ApiKey)\s+[A-Za-z0-9\-._~+/=:]+/gi, '$1 ***REDACTED***')
    .replace(/((?:^|[?&\s])[^=&\s]*(?:token|key|secret|password|code)[^=&\s]*=)([^&\s]+)/gi, '$1***REDACTED***')
    .replace(
      /(\b(?:password|secret|token|api[-_]?key|api_key|client_secret|access_token|refresh_token|authorization_code|code)\b\s*:\s*)([^\s&,}]+)/gi,
      '$1***REDACTED***'
    )
    .replace(
      /(\b(?:password|secret|token|api[-_]?key|api_key|client_secret|access_token|refresh_token|authorization_code)\b\s+)([^\s&,}]+)/gi,
      '$1***REDACTED***'
    );
}

function normalizeRecipientPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) throw new Error('Priority webhook payload is missing ORDERS.ZANA_PHONENUM.');
  let normalized = raw.replace(/[\s()-]/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  else if (normalized.startsWith('972')) normalized = `+${normalized}`;
  else if (normalized.startsWith('0')) normalized = `+972${normalized.slice(1)}`;
  if (!/^\+[0-9]{8,15}$/.test(normalized)) {
    throw new Error('ORDERS.ZANA_PHONENUM must be a valid Israeli or E.164 phone number.');
  }
  return normalized;
}

function requiredText(value, fieldName) {
  if (value && typeof value === 'object') {
    throw new Error(`Priority webhook field ${fieldName} must contain raw text, not a redacted display summary.`);
  }
  const text = String(value || '').trim();
  if (!text) throw new Error(`Priority webhook payload is missing ${fieldName}.`);
  return text;
}

function getOrderFields(payload) {
  const order = payload?.ORDERS;
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new Error('Priority webhook payload must include an ORDERS object.');
  }
  return {
    orderName: requiredText(order.ORDNAME, 'ORDERS.ORDNAME'),
    customerDescription: requiredText(order.ZANA_CUSTDES, 'ORDERS.ZANA_CUSTDES'),
    recipientPhone: normalizeRecipientPhone(order.ZANA_PHONENUM),
  };
}

function mapOrder(payload, credentials = {}, priorityDocumentUrl) {
  const { orderName, customerDescription, recipientPhone } = getOrderFields(payload);
  const channelId = String(credentials.ITC_CHANNEL_ID || '').trim();
  const documentUrl = String(priorityDocumentUrl || '').trim();
  if (!/^whatsapp:\+[0-9]{8,15}$/.test(channelId)) {
    throw new Error('ITC Channel ID must use the format whatsapp:+<country-code><number>.');
  }
  try {
    const parsedDocumentUrl = new URL(documentUrl);
    if (parsedDocumentUrl.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('Sales order confirmation URL must be a valid HTTPS URL.');
  }
  return {
    clientName: recipientPhone,
    msgType: 'whatsapp',
    channelId,
    variables: [
      { type: 'text', text: customerDescription },
      { type: 'text', text: orderName },
      { type: 'text', text: documentUrl },
    ],
  };
}

function maskPhone(value) {
  const text = String(value || '');
  if (text.length <= 4) return '***';
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

function safeRequestSummary(endpoint, body) {
  return {
    endpoint: String(endpoint).replace(/([?&][^=]*(?:token|key|secret|password|code)[^=]*=)[^&]+/gi, '$1***REDACTED***'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ***REDACTED***' },
    body: {
      clientName: maskPhone(body.clientName),
      msgType: body.msgType,
      channelId: `whatsapp:${maskPhone(String(body.channelId).replace(/^whatsapp:/, ''))}`,
      variables: body.variables.map((variable, index) => ({
        type: variable.type,
        text: index === 1
          ? { type: 'redacted', reason: 'sensitive personal data' }
          : index === 2
            ? {
                type: 'redacted',
                reason: 'server-hosted Priority document URL',
                ...safeDocumentUrlSummary(variable.text),
              }
            : variable.text,
      })),
    },
  };
}

function safeDocumentUrlSummary(value) {
  try {
    const parsed = new URL(value);
    return { available: true, host: parsed.host, protocol: parsed.protocol };
  } catch {
    return { available: Boolean(value), validUrl: false };
  }
}

function safeResponseValue(value, keyName = '', depth = 0) {
  if (value === null || value === undefined) return value;
  const safeScalarKey = /^(?:id|_id|messageId|requestId|externalRequestId|status|statusCode|code|success|mocked|timestamp|createdAt|type)$/i;
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    if (safeScalarKey.test(keyName)) return typeof value === 'string' ? sanitizeProviderString(value).slice(0, 160) : value;
    return {
      type: 'redacted',
      reason: 'provider response field not allowlisted',
      ...(typeof value === 'string' ? { length: value.length } : {}),
    };
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length, sample: depth >= 2 ? undefined : value.slice(0, 5).map((item) => safeResponseValue(item, keyName, depth + 1)) };
  }
  if (typeof value !== 'object') return { type: typeof value };
  if (depth >= 3) return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, safeResponseValue(item, key, depth + 1)]));
}

function safeResponseSummary(value) {
  return safeResponseValue(value);
}

function parseResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: { type: 'redacted', reason: 'unstructured provider response', length: text.length } };
  }
}

function configuration(credentials = {}) {
  const endpoint = String(credentials.ITC_TEMPLATE_MESSAGE_URL || '').trim();
  const bearerToken = String(credentials.ITC_BEARER_TOKEN || '').trim();
  if (!endpoint) throw new Error('Missing ITC Template Message URL credential.');
  if (!bearerToken) throw new Error('Missing ITC Bearer Token credential.');
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('ITC Template Message URL must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('ITC Template Message URL must use HTTPS.');
  return { endpoint: parsed.toString(), bearerToken };
}

async function sendTemplateMessage(body, credentials, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  beforeSend,
} = {}) {
  const config = configuration(credentials);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (beforeSend) await beforeSend();
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.bearerToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseBody = parseResponse(await response.text());
    if (!response.ok) {
      const error = new Error(`ITC template message API failed with HTTP ${response.status}.`);
      error.providerError = {
        api: 'ITC template message API',
        action: 'POST template message',
        endpoint: config.endpoint,
        httpStatus: response.status,
        responseSummary: safeResponseSummary(responseBody),
        explanation: 'ITC rejected the request. Check the rotated token, template endpoint, channel, recipient, and variable order.',
      };
      error.deliveryAmbiguous = response.status >= 500;
      throw error;
    }
    return {
      success: true,
      status: response.status,
      providerMessageId: responseBody.messageId || responseBody.id || responseBody._id
        ? sanitizeProviderString(responseBody.messageId || responseBody.id || responseBody._id).slice(0, 160)
        : null,
      data: responseBody,
    };
  } catch (error) {
    if (error.providerError) throw error;
    const normalized = new Error(error.name === 'AbortError' ? `ITC template message API timed out after ${timeoutMs}ms.` : 'ITC template message API could not be reached.');
    normalized.providerError = {
      api: 'ITC template message API',
      action: 'POST template message',
      endpoint: config.endpoint,
      networkErrorName: error.name || 'NetworkError',
      explanation: 'No HTTP response was received. Delivery status is unknown, so the worker did not retry inside the request.',
    };
    normalized.deliveryAmbiguous = true;
    throw normalized;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getOrderFields,
  mapOrder,
  normalizeRecipientPhone,
  safeDocumentUrlSummary,
  safeRequestSummary,
  safeResponseSummary,
  sanitizeProviderString,
  sendTemplateMessage,
};
