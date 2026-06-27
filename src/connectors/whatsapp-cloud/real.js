const { summarizePayload } = require('../../utils/payload-summary');

const GRAPH_HOST = 'https://graph.facebook.com';

function normalizeApiVersion(version) {
  const trimmed = String(version || 'v25.0').trim();
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

function buildPhoneNumberEndpoint(credentials = {}) {
  const apiVersion = normalizeApiVersion(credentials.WHATSAPP_GRAPH_API_VERSION);
  const phoneNumberId = String(credentials.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (!phoneNumberId) return '';
  return `${GRAPH_HOST}/${apiVersion}/${phoneNumberId}`;
}

function missingCredentialMessage(missing) {
  return `Missing WhatsApp Cloud credential${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`;
}

module.exports = {
  async testConnection(credentials = {}) {
    const missing = [];
    if (!credentials.WHATSAPP_ACCESS_TOKEN) missing.push('WhatsApp Access Token');
    if (!credentials.WHATSAPP_PHONE_NUMBER_ID) missing.push('WhatsApp Phone Number ID');
    if (!credentials.WHATSAPP_GRAPH_API_VERSION) missing.push('Graph API Version');
    if (missing.length) {
      return {
        success: false,
        message: missingCredentialMessage(missing),
        nextStep: 'Open Credentials, fill the missing WhatsApp Cloud fields, save, then test again.',
      };
    }

    const endpoint = buildPhoneNumberEndpoint(credentials);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.WHATSAPP_ACCESS_TOKEN}` },
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      const responseSummary = summarizePayload(body);

      if (!response.ok) {
        return {
          success: false,
          message: `WhatsApp Cloud API credential test failed with HTTP ${response.status}.`,
          endpoint,
          responseSummary,
          nextStep: 'Check that the access token belongs to this WhatsApp Business account and that the phone number ID is correct.',
        };
      }

      return {
        success: true,
        message: 'WhatsApp Cloud API credentials were accepted for this phone number ID.',
        endpoint,
        responseSummary,
      };
    } catch (err) {
      return {
        success: false,
        message: `WhatsApp Cloud API credential test could not reach Meta: ${err.message}`,
        endpoint,
        nextStep: 'Check your internet connection and Meta Graph API availability, then try again.',
      };
    }
  },
  _diagnostics: { buildPhoneNumberEndpoint },
};
