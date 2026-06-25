const { EventEmitter } = require('events');
const https = require('https');
const fs = require('fs');
const path = require('path');

function mockHttpsJsonResponse(statusCode, body) {
  jest.spyOn(https, 'request').mockImplementation((options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = jest.fn();
    req.write = jest.fn();
    req.end = jest.fn(() => {
      const res = new EventEmitter();
      res.statusCode = statusCode;
      res.setEncoding = jest.fn();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify(body));
        res.emit('end');
      });
    });
    req.destroy = jest.fn();
    return req;
  });
}

describe('gmail connector diagnostics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('testConnection reports missing OAuth fields with next steps', async () => {
    const gmail = require('../../src/connectors/gmail/real');

    const result = await gmail.testConnection({});

    expect(result).toMatchObject({
      success: false,
      provider: 'gmail-api',
      step: 'validate_credentials',
    });
    expect(result.message).toContain('GMAIL_CLIENT_ID');
    expect(result.message).toContain('GMAIL_CLIENT_SECRET');
    expect(result.message).toContain('GMAIL_REFRESH_TOKEN');
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  test('testConnection explains Google invalid_grant refresh token errors', async () => {
    mockHttpsJsonResponse(400, {
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    });
    const gmail = require('../../src/connectors/gmail/real');

    const result = await gmail.testConnection({
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REFRESH_TOKEN: 'refresh-token',
    });

    expect(result).toMatchObject({
      success: false,
      provider: 'gmail-api',
      step: 'refresh_access_token',
      statusCode: 400,
      errorCode: 'invalid_grant',
    });
    expect(result.message).toContain('refresh token');
    expect(result.nextSteps.join(' ')).toContain('scripts/gmail-get-token.js');
  });

  test('sendEmail formats invalid_client OAuth failures for execution errors', async () => {
    mockHttpsJsonResponse(401, {
      error: 'invalid_client',
      error_description: 'The OAuth client was not found.',
    });
    const gmail = require('../../src/connectors/gmail/real');

    await expect(gmail.sendEmail(
      { to: 'ops@example.test', subject: 'Test', text: 'Hello' },
      {
        GMAIL_USER_EMAIL: 'automation@example.test',
        GMAIL_CLIENT_ID: 'missing-client-id',
        GMAIL_CLIENT_SECRET: 'client-secret',
        GMAIL_REFRESH_TOKEN: 'refresh-token',
      }
    )).rejects.toThrow(/Google rejected the OAuth client credentials/);
  });

  test('loads Google OAuth client and refresh token from local user token files', async () => {
    const dir = path.join(process.cwd(), 'local-data', 'users', 'gmail_file_test_user', 'gmail credentails');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'client_secret_test.json'), JSON.stringify({
      installed: {
        client_id: 'local-client-id.apps.googleusercontent.com',
        client_secret: 'local-client-secret',
      },
    }));
    fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
      access_token: 'local-access-token',
      refresh_token: 'local-refresh-token',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      token_type: 'Bearer',
    }));

    const gmail = require('../../src/connectors/gmail/real');
    const config = gmail._diagnostics.getOAuthConfig({
      __USER_SLUG: 'gmail_file_test_user',
      GMAIL_USE_LOCAL_FILES: true,
      GMAIL_CLIENT_ID: 'saved-client-id',
      GMAIL_CLIENT_SECRET: 'saved-client-secret',
      GMAIL_REFRESH_TOKEN: 'saved-refresh-token',
    });

    expect(config).toMatchObject({
      clientId: 'local-client-id.apps.googleusercontent.com',
      clientSecret: 'local-client-secret',
      refreshToken: 'local-refresh-token',
      userEmail: 'me',
      credentialsSource: 'local_files',
    });

    fs.rmSync(path.join(process.cwd(), 'local-data', 'users', 'gmail_file_test_user'), { recursive: true, force: true });
  });
});
