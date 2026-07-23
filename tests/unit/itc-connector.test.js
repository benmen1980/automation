const itc = require('../../src/connectors/itc/real');

function credentials(overrides = {}) {
  return {
    ITC_TEMPLATE_MESSAGE_URL: 'https://sv1.effective-oc.com/api/v2/msg/sendMsg/tempMsg/template-test-id',
    ITC_BEARER_TOKEN: 'test-itc-bearer-token-1234567890',
    ITC_CHANNEL_ID: 'whatsapp:+97246960480',
    ...overrides,
  };
}

function body() {
  return {
    clientName: '+972507573753',
    msgType: 'whatsapp',
    channelId: 'whatsapp:+97246960480',
    variables: [
      { type: 'text', text: 'SO26000001' },
      { type: 'text', text: 'ירדן' },
      { type: 'text', text: 'https://priority.example.test/netfiles/SO26000001.htm' },
    ],
  };
}

describe('ITC connector', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('configuration test never sends a message', async () => {
    global.fetch = jest.fn();

    const result = await itc.testConnection(credentials());

    expect(result).toMatchObject({ success: true, configurationOnly: true });
    expect(result.message).toContain('No message was sent');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('test-itc-bearer-token');
  });

  test('configuration test reports missing fields safely', async () => {
    const result = await itc.testConnection({});

    expect(result.success).toBe(false);
    expect(result.message).toContain('Missing ITC settings');
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });

  test('posts the exact template body and accepts any HTTP 2xx response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        text: () => Promise.resolve(JSON.stringify({ messageId: 'itc-message-1', status: 'queued' })),
      })
    );

    const result = await itc.sendTemplateMessage({ body: body() }, credentials());

    expect(result).toMatchObject({ success: true, status: 202, providerMessageId: 'itc-message-1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = global.fetch.mock.calls[0];
    expect(endpoint).toBe('https://sv1.effective-oc.com/api/v2/msg/sendMsg/tempMsg/template-test-id');
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-itc-bearer-token-1234567890',
      },
    });
    expect(JSON.parse(options.body)).toEqual(body());
  });

  test('non-2xx failures expose only a sanitized provider summary', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: 'invalid token',
              clientName: '+972507573753',
              authorization: 'Bearer should-never-escape',
            })
          ),
      })
    );

    await expect(itc.sendTemplateMessage({ body: body() }, credentials())).rejects.toThrow(
      'ITC template message API failed with HTTP 401.'
    );

    try {
      await itc.sendTemplateMessage({ body: body() }, credentials());
    } catch (err) {
      const serialized = JSON.stringify({ message: err.message, providerError: err.providerError });
      expect(serialized).not.toContain('+972507573753');
      expect(serialized).not.toContain('should-never-escape');
      expect(serialized).not.toContain('test-itc-bearer-token');
      expect(err.providerError.responseSummary.clientName).toMatchObject({ type: 'redacted' });
    }
  });

  test('unstructured provider responses are never returned verbatim', () => {
    const parsed = itc._diagnostics.parseResponseText('recipient +972507573753 token should-never-escape');

    expect(parsed.rawText).toEqual({
      type: 'redacted',
      reason: 'unstructured provider response',
      length: 49,
    });
    expect(JSON.stringify(parsed)).not.toContain('+972507573753');
    expect(JSON.stringify(parsed)).not.toContain('should-never-escape');
  });

  test('network failures include normalized provider diagnostics without credentials', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('getaddrinfo ENOTFOUND with token should-never-escape')));

    try {
      await itc.sendTemplateMessage({ body: body() }, credentials());
      throw new Error('Expected connector to fail');
    } catch (err) {
      expect(err.message).toBe('ITC template message API could not be reached.');
      expect(err.providerError).toMatchObject({
        api: 'ITC template message API',
        action: 'POST template message',
        networkErrorName: 'TypeError',
      });
      const serialized = JSON.stringify({ message: err.message, providerError: err.providerError });
      expect(serialized).not.toContain('should-never-escape');
      expect(serialized).not.toContain('test-itc-bearer-token');
    }
  });
});
