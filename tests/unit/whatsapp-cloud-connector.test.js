const whatsappCloud = require('../../src/connectors/whatsapp-cloud/real');

describe('whatsapp-cloud connector diagnostics', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('reports missing credentials without calling Meta', async () => {
    global.fetch = jest.fn();

    const result = await whatsappCloud.testConnection({});

    expect(result.success).toBe(false);
    expect(result.message).toContain('Missing WhatsApp Cloud credentials');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('checks the phone number endpoint with saved credentials', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: '404655686058819', verified_name: 'Test Business' })),
      })
    );

    const result = await whatsappCloud.testConnection({
      WHATSAPP_ACCESS_TOKEN: 'test-token',
      WHATSAPP_PHONE_NUMBER_ID: '404655686058819',
      WHATSAPP_GRAPH_API_VERSION: 'v25.0',
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://graph.facebook.com/v25.0/404655686058819', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(JSON.stringify(result)).not.toContain('test-token');
    expect(JSON.stringify(result)).not.toContain('Test Business');
  });
});
