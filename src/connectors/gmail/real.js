const https = require('https');
const fs = require('fs');
const path = require('path');

class ProviderHttpError extends Error {
  constructor(message, { statusCode, hostname, path, data }) {
    super(message);
    this.name = 'ProviderHttpError';
    this.statusCode = statusCode;
    this.hostname = hostname;
    this.path = path;
    this.data = data;
  }
}

function redactProviderData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = /(token|secret|password|key|authorization)/i.test(key) ? '[REDACTED]' : value;
  }
  return out;
}

function gmailFailure({ step, message, statusCode, errorCode, providerError, nextSteps = [] }) {
  return {
    success: false,
    provider: 'gmail-api',
    step,
    message,
    ...(statusCode ? { statusCode } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(providerError ? { providerError: redactProviderData(providerError) } : {}),
    nextSteps,
  };
}

function missingCredentialFailure(missing) {
  return gmailFailure({
    step: 'validate_credentials',
    message: `Missing Gmail OAuth credential${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
    nextSteps: [
      'Save the Gmail Account Email, Google OAuth Client ID, Google OAuth Client Secret, and Gmail Refresh Token fields.',
      'After saving, secret inputs show password dots as a secure placeholder; the real value is never displayed.',
    ],
  });
}

function classifyNetworkError(err, hostname) {
  const code = err.code || err.cause?.code;
  if (code === 'ENOTFOUND') return `Could not resolve ${hostname}. Check DNS or internet access from the server.`;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return `Timed out connecting to ${hostname}. Check firewall/proxy access.`;
  if (code === 'ECONNRESET') return `Connection to ${hostname} was reset. Check proxy, firewall, or TLS inspection settings.`;
  if (code === 'ECONNREFUSED') return `Connection to ${hostname} was refused. Check outbound network rules.`;
  if (/certificate|self[- ]signed|unable to verify|tls/i.test(err.message || '')) {
    return `TLS/certificate validation failed while connecting to ${hostname}. Check corporate proxy or certificate trust settings.`;
  }
  return `Could not reach ${hostname}: ${err.message}`;
}

function formatOAuthHttpFailure(err) {
  const data = err.data || {};
  const code = data.error;
  const description = data.error_description || data.error || 'Google OAuth token endpoint rejected the request.';

  if (code === 'invalid_client') {
    return gmailFailure({
      step: 'refresh_access_token',
      statusCode: err.statusCode,
      errorCode: code,
      providerError: data,
      message: 'Google rejected the OAuth client credentials.',
      nextSteps: [
        'Verify Google OAuth Client ID and Google OAuth Client Secret were copied from the same OAuth client.',
        'Confirm the OAuth client is not deleted or disabled in Google Cloud Console.',
      ],
    });
  }

  if (code === 'invalid_grant') {
    return gmailFailure({
      step: 'refresh_access_token',
      statusCode: err.statusCode,
      errorCode: code,
      providerError: data,
      message: 'Google rejected the refresh token. It may be expired, revoked, or from a different OAuth client.',
      nextSteps: [
        'Generate a new refresh token with scripts/gmail-get-token.js using the same Client ID and Client Secret saved in this integration.',
        'Make sure the Google consent flow includes access_type=offline and the gmail.send scope.',
      ],
    });
  }

  return gmailFailure({
    step: 'refresh_access_token',
    statusCode: err.statusCode,
    errorCode: code,
    providerError: data,
    message: `Google OAuth token endpoint failed: ${description}`,
    nextSteps: [
      'Check the saved OAuth credentials and refresh token.',
      'If this persists, generate a new refresh token and save it again.',
    ],
  });
}

function formatGmailError(err, step = 'refresh_access_token') {
  if (err instanceof ProviderHttpError) {
    if (err.hostname === 'oauth2.googleapis.com') return formatOAuthHttpFailure(err);

    return gmailFailure({
      step,
      statusCode: err.statusCode,
      errorCode: err.data?.error,
      providerError: err.data,
      message: `Gmail API request failed with status ${err.statusCode}.`,
      nextSteps: [
        'Check the Gmail account email and that the OAuth token has the gmail.send scope.',
        'Open the provider error details below for the exact Google response.',
      ],
    });
  }

  return gmailFailure({
    step,
    errorCode: err.code || err.cause?.code,
    message: classifyNetworkError(err, err.hostname || (step === 'send_email' ? 'gmail.googleapis.com' : 'oauth2.googleapis.com')),
    nextSteps: [
      `Confirm the backend server has outbound HTTPS access to ${step === 'send_email' ? 'gmail.googleapis.com' : 'oauth2.googleapis.com'}.`,
      'If you use a corporate proxy or firewall, allow Google API traffic.',
    ],
  });
}

function formatFailureForException(failure) {
  const parts = [failure.message];
  if (failure.errorCode) parts.push(`Error code: ${failure.errorCode}.`);
  if (failure.statusCode) parts.push(`HTTP status: ${failure.statusCode}.`);
  if (failure.nextSteps?.length) parts.push(`Next steps: ${failure.nextSteps.join(' ')}`);
  return parts.join(' ');
}

function truthy(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findClientSecretFile(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  return fs
    .readdirSync(dirPath)
    .find((name) => /^client_secret_.*\.json$/i.test(name) || name === 'client_secret.json') || null;
}

function defaultLocalCredentialDirs(userSlug) {
  if (!userSlug) return [];
  const base = path.join(process.cwd(), 'local-data', 'users', userSlug);
  return [
    path.join(base, 'gmail credentials'),
    path.join(base, 'gmail credentails'),
  ];
}

function loadLocalGmailCredentials(credentials = {}) {
  const configuredDir = credentials.GMAIL_LOCAL_CREDENTIALS_DIR || process.env.GMAIL_LOCAL_CREDENTIALS_DIR;
  const dirs = configuredDir ? [configuredDir] : defaultLocalCredentialDirs(credentials.__USER_SLUG);

  for (const dir of dirs) {
    const tokenPath = path.join(dir, 'token.json');
    const clientSecretName = findClientSecretFile(dir);
    if (!clientSecretName || !fs.existsSync(tokenPath)) continue;

    const clientSecretFile = readJsonFile(path.join(dir, clientSecretName));
    const tokenFile = readJsonFile(tokenPath);
    const client = clientSecretFile.installed || clientSecretFile.web || clientSecretFile;
    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      refreshToken: tokenFile.refresh_token,
      accessToken: tokenFile.access_token,
      tokenExpiryDate: tokenFile.expiry_date,
      scope: tokenFile.scope,
      source: dir,
    };
  }

  return null;
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function base64Url(value) {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64Mime(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

function requestJson({ method = 'GET', hostname, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        method,
        hostname,
        path,
        headers: {
          ...(payload !== undefined ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data = {};
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = { raw };
            }
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new ProviderHttpError(`Gmail API error (${res.statusCode})`, { statusCode: res.statusCode, hostname, path, data }));
            return;
          }
          resolve(data);
        });
      }
    );
    req.setTimeout(30000, () => {
      req.destroy(new Error('Gmail API request timed out.'));
    });
    req.on('error', (err) => {
      err.hostname = hostname;
      err.path = path;
      reject(err);
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function getOAuthConfig(credentials = {}) {
  const fileCredentials = truthy(credentials.GMAIL_USE_LOCAL_FILES || process.env.GMAIL_USE_LOCAL_FILES)
    ? loadLocalGmailCredentials(credentials)
    : null;

  return {
    clientId: fileCredentials?.clientId || credentials.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
    clientSecret: fileCredentials?.clientSecret || credentials.GMAIL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
    refreshToken: fileCredentials?.refreshToken || credentials.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN,
    accessToken: fileCredentials?.accessToken,
    tokenExpiryDate: fileCredentials?.tokenExpiryDate,
    credentialsSource: fileCredentials ? 'local_files' : 'saved_credentials',
    credentialsPath: fileCredentials?.source,
    userEmail: fileCredentials ? 'me' : (credentials.GMAIL_USER_EMAIL || process.env.GMAIL_USER_EMAIL || 'me'),
    fromEmail: credentials.GMAIL_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || credentials.GMAIL_USER_EMAIL || process.env.GMAIL_USER_EMAIL || null,
  };
}

async function refreshAccessToken(credentials) {
  const { clientId, clientSecret, refreshToken } = getOAuthConfig(credentials);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail API requires GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const token = await requestJson({
    method: 'POST',
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!token.access_token) throw new Error('Gmail OAuth token refresh did not return an access token.');
  return token.access_token;
}

function validateOAuthConfig(credentials) {
  const config = getOAuthConfig(credentials);
  const missing = [];
  if (!config.clientId) missing.push('GMAIL_CLIENT_ID');
  if (!config.clientSecret) missing.push('GMAIL_CLIENT_SECRET');
  if (!config.refreshToken) missing.push('GMAIL_REFRESH_TOKEN');
  return { config, missing };
}

function buildMimeMessage({ from, to, subject, text, attachments = [] }) {
  const recipients = normalizeRecipients(to);
  const boundary = `automation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const headers = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${recipients.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text || '',
  ];

  for (const attachment of attachments) {
    const filename = attachment.filename || 'attachment.txt';
    const contentType = attachment.contentType || 'application/octet-stream';
    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64Mime(attachment.content || '')
    );
  }

  parts.push(`--${boundary}--`, '');
  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
}

module.exports = {
  async parseQuoteRequest({ email, subject, body }) {
    return {
      success: true,
      mocked: false,
      quote: { email, subject, customerName: email, requestedItems: [{ description: body, quantity: 1 }] },
    };
  },

  async sendEmail({ to, subject, text, attachments = [] }, credentials) {
    const recipients = normalizeRecipients(to);
    if (recipients.length === 0) throw new Error('Gmail send requires at least one recipient.');

    const config = getOAuthConfig(credentials);
    let accessToken;
    try {
      accessToken = await refreshAccessToken(credentials);
    } catch (err) {
      throw new Error(formatFailureForException(formatGmailError(err, 'refresh_access_token')));
    }

    const raw = base64Url(buildMimeMessage({ from: config.fromEmail, to: recipients, subject, text, attachments }));
    const user = encodeURIComponent(config.userEmail || 'me');
    let result;
    try {
      result = await requestJson({
        method: 'POST',
        hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/${user}/messages/send`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: { raw },
      });
    } catch (err) {
      throw new Error(formatFailureForException(formatGmailError(err, 'send_email')));
    }

    return { success: true, provider: 'gmail-api', providerMessageId: result.id || null, recipientCount: recipients.length };
  },

  async testConnection(credentials) {
    const { missing } = validateOAuthConfig(credentials);
    if (missing.length > 0) return missingCredentialFailure(missing);

    try {
      const config = getOAuthConfig(credentials);
      await refreshAccessToken(credentials);
      return {
        success: true,
        provider: 'gmail-api',
        step: 'refresh_access_token',
        credentialsSource: config.credentialsSource,
        message: `Gmail OAuth refresh token is valid. Gmail API can issue an access token using ${config.credentialsSource === 'local_files' ? 'local token files' : 'saved credentials'}.`,
      };
    } catch (err) {
      return formatGmailError(err, 'refresh_access_token');
    }
  },
  _diagnostics: { formatGmailError, formatFailureForException, loadLocalGmailCredentials, getOAuthConfig },
};
