/**
 * Gmail OAuth helper for local development.
 *
 * 1. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in .env.
 * 2. Run: node scripts/gmail-get-token.js
 * 3. Open the printed URL, approve Gmail send scope, then rerun with:
 *    node scripts/gmail-get-token.js --code YOUR_AUTH_CODE
 * 4. Copy the printed refresh-token status into the integration credential form.
 *
 * This script never prints the actual refresh token. It writes it to
 * data/gmail-token.json, which is ignored by git.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const TOKEN_PATH = path.join(process.cwd(), 'data', 'gmail-token.json');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env`);
  return value;
}

function getCodeArg() {
  const idx = process.argv.indexOf('--code');
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function requestJson({ method = 'POST', hostname, path: requestPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        method,
        hostname,
        path: requestPath,
        headers: { 'Content-Length': Buffer.byteLength(payload), ...headers },
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
            reject(new Error(`OAuth token exchange failed (${res.statusCode}): ${JSON.stringify(data)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const clientId = required('GMAIL_CLIENT_ID');
  const clientSecret = required('GMAIL_CLIENT_SECRET');
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';
  const code = getCodeArg();

  if (!code) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    console.log('Open this URL to approve Gmail send access:');
    console.log(url.toString());
    console.log('\nThen run: node scripts/gmail-get-token.js --code YOUR_AUTH_CODE');
    return;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code,
  }).toString();

  const token = await requestJson({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!token.refresh_token) {
    throw new Error('Google did not return a refresh token. Re-run the auth URL with prompt=consent and access_type=offline.');
  }

  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ refresh_token: token.refresh_token, scope: token.scope, token_type: token.token_type }, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
  console.log(`Gmail refresh token saved to ${TOKEN_PATH}.`);
  console.log('Copy the refresh token into the integration credential field GMAIL_REFRESH_TOKEN. The token value is not printed here.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
