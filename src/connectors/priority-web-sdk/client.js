const priority = require('priority-web-sdk');
const { sanitizeString } = require('../../utils/sanitize-logs');

const DEFAULT_ORDER_SORT_OPTION = 'By Order Number';

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Missing ${label} credential.`);
  return text;
}

function getConfiguration(credentials = {}) {
  const url = requiredText(credentials.PRIORITY_WEB_SDK_URL, 'Priority Web SDK URL');
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Priority Web SDK URL must be a valid HTTPS URL.');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Priority Web SDK URL must use HTTPS.');
  }

  const language = Number(credentials.PRIORITY_WEB_SDK_LANGUAGE || 3);
  if (!Number.isInteger(language) || language < 1) {
    throw new Error('Priority Web SDK language must be a positive integer.');
  }

  const company = requiredText(credentials.PRIORITY_WEB_SDK_COMPANY, 'Priority company');
  return {
    config: {
      url: parsedUrl.toString(),
      tabulaini: String(credentials.PRIORITY_WEB_SDK_TABULAINI || 'tabula.ini').trim(),
      language,
      profile: { company },
      appname: requiredText(
        credentials.PRIORITY_WEB_SDK_APPNAME || company,
        'Priority app name'
      ),
      username: requiredText(credentials.PRIORITY_WEB_SDK_USERNAME, 'Priority username'),
      password: requiredText(credentials.PRIORITY_WEB_SDK_PASSWORD, 'Priority password'),
      devicename: String(credentials.PRIORITY_WEB_SDK_DEVICENAME || '').trim(),
    },
    orderSortOption: String(
      credentials.PRIORITY_WEB_SDK_ORDER_SORT_OPTION || DEFAULT_ORDER_SORT_OPTION
    ).trim(),
  };
}

function replaceKnownValue(text, value) {
  const knownValue = String(value || '');
  return knownValue ? text.split(knownValue).join('***REDACTED***') : text;
}

function safePriorityErrorText(cause, credentials = {}) {
  const rawMessage = String(
    cause?.message || cause?.error?.message || cause?.error || cause?.type || ''
  ).trim();
  if (!rawMessage) return '';

  let safeMessage = sanitizeString(rawMessage);
  for (const knownValue of [
    credentials.PRIORITY_WEB_SDK_PASSWORD,
    credentials.PRIORITY_WEB_SDK_USERNAME,
  ]) {
    safeMessage = replaceKnownValue(safeMessage, knownValue);
  }
  return safeMessage.slice(0, 600);
}

async function login(credentials, { sdk = priority } = {}) {
  const { config } = getConfiguration(credentials);
  await sdk.login(config);
  return config;
}

function safeDocumentUrlSummary(value) {
  try {
    const parsed = new URL(value);
    return {
      available: true,
      host: parsed.host,
      protocol: parsed.protocol,
    };
  } catch {
    return { available: Boolean(value), validUrl: false };
  }
}

module.exports = {
  DEFAULT_ORDER_SORT_OPTION,
  getConfiguration,
  login,
  safePriorityErrorText,
  safeDocumentUrlSummary,
};
