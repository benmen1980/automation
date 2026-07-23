jest.mock('priority-web-sdk', () => ({
  login: jest.fn(() => Promise.resolve()),
  procStart: jest.fn(),
}));

const priority = require('priority-web-sdk');
const connector = require('../../src/connectors/priority-web-sdk/real');

function credentials(overrides = {}) {
  return {
    PRIORITY_WEB_SDK_URL: 'https://priority.example.test/wcf/wcf/Service.svc',
    PRIORITY_WEB_SDK_TABULAINI: 'tabula.ini',
    PRIORITY_WEB_SDK_LANGUAGE: 3,
    PRIORITY_WEB_SDK_COMPANY: 'demo',
    PRIORITY_WEB_SDK_APPNAME: 'automation-test',
    PRIORITY_WEB_SDK_USERNAME: 'api-user',
    PRIORITY_WEB_SDK_PASSWORD: 'priority-password',
    PRIORITY_WEB_SDK_DEVICENAME: '',
    PRIORITY_WEB_SDK_ORDER_SORT_OPTION: 'By Order Number',
    ...overrides,
  };
}

describe('Priority Web SDK settings connector', () => {
  afterEach(() => {
    priority.login.mockClear();
    priority.procStart.mockClear();
  });

  test('connection test logs in without running integration business logic', async () => {
    const result = await connector.testConnection(credentials());

    expect(priority.login).toHaveBeenCalledWith({
      url: 'https://priority.example.test/wcf/wcf/Service.svc',
      tabulaini: 'tabula.ini',
      language: 3,
      profile: { company: 'demo' },
      appname: 'automation-test',
      username: 'api-user',
      password: 'priority-password',
      devicename: '',
    });
    expect(priority.procStart).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      provider: 'Priority Web SDK',
    });
    expect(JSON.stringify(result)).not.toContain('priority-password');
    expect(JSON.stringify(result)).not.toContain('api-user');
  });

  test('connection failure identifies login and redacts credentials and token-shaped data', async () => {
    priority.login.mockRejectedValueOnce(
      new Error(
        'login failed password=priority-password for api-user?access_token=secret-token&code=secret-code'
      )
    );

    const result = await connector.testConnection(credentials());

    expect(result.success).toBe(false);
    expect(result.message).toContain('login failed');
    expect(JSON.stringify(result)).not.toContain('priority-password');
    expect(JSON.stringify(result)).not.toContain('api-user');
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('secret-code');
  });

  test('invalid non-HTTPS settings fail before any login request', async () => {
    const result = await connector.testConnection(
      credentials({ PRIORITY_WEB_SDK_URL: 'http://priority.example.test' })
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('must use HTTPS');
    expect(priority.login).not.toHaveBeenCalled();
  });
});
