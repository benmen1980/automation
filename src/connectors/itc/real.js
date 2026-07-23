const { sanitizeString } = require('../../utils/sanitize-logs');
const workerClient = require('../../../integrations/priority-order-itc/src/itcClient.cjs');

function getConfiguration(credentials = {}) {
  const endpoint = String(credentials.ITC_TEMPLATE_MESSAGE_URL || '').trim();
  const bearerToken = String(credentials.ITC_BEARER_TOKEN || '').trim();
  const channelId = String(credentials.ITC_CHANNEL_ID || '').trim();
  const missing = [];

  if (!endpoint) missing.push('ITC Template Message URL');
  if (!bearerToken) missing.push('ITC Bearer Token');
  if (!channelId) missing.push('ITC Channel ID');

  if (missing.length) {
    throw new Error(`Missing ITC setting${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  }

  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error('ITC Template Message URL must be a valid HTTPS URL.');
  }
  if (parsedEndpoint.protocol !== 'https:') throw new Error('ITC Template Message URL must use HTTPS.');
  if (!/^whatsapp:\+[0-9]{8,15}$/.test(channelId)) {
    throw new Error('ITC Channel ID must use the format whatsapp:+<country-code><number>.');
  }

  return {
    endpoint: parsedEndpoint.toString(),
    bearerToken,
    channelId,
  };
}

function parseResponseText(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      rawText: {
        type: 'redacted',
        reason: 'unstructured provider response',
        length: String(text).length,
      },
    };
  }
}

function getProviderMessageId(body = {}) {
  return body.messageId || body.id || body._id || body.data?.messageId || body.data?.id || body.data?._id || null;
}

async function sendTemplateMessage({ body } = {}, credentials = {}) {
  getConfiguration(credentials);
  if (!body || typeof body !== 'object') throw new Error('ITC template message body is required.');
  const result = await workerClient.sendTemplateMessage(body, credentials);
  return { ...result, mocked: false };
}

async function testConnection(credentials = {}) {
  try {
    const config = getConfiguration(credentials);
    return {
      success: true,
      configurationOnly: true,
      endpoint: sanitizeString(config.endpoint),
      message: 'ITC settings are complete. No message was sent because no non-delivery test endpoint was provided. Use Mock Output before the first Live run.',
      nextStep: 'Run Mock Output to verify mapping, then use Live only when the intended recipient can receive a real message.',
    };
  } catch (err) {
    return {
      success: false,
      configurationOnly: true,
      message: err.message,
      nextStep: 'Complete the ITC endpoint, rotated bearer token, and channel ID, save, then test again.',
    };
  }
}

module.exports = {
  sendTemplateMessage,
  testConnection,
  _diagnostics: {
    getConfiguration,
    getProviderMessageId,
    parseResponseText,
  },
};
