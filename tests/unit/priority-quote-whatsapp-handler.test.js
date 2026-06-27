const handler = require('../../src/integrations/user_001/priority-quote-whatsapp/handler');
const integrationDefinition = require('../../src/integrations/user_001/priority-quote-whatsapp/integration');
const { validateIntegrationContract } = require('../../src/core/integration-loader');

function createLogger() {
  return {
    info: jest.fn(() => Promise.resolve()),
    warning: jest.fn(() => Promise.resolve()),
    error: jest.fn(() => Promise.resolve()),
    debug: jest.fn(() => Promise.resolve()),
  };
}

function credentials(overrides = {}) {
  return {
    WHATSAPP_ACCESS_TOKEN: 'test-whatsapp-token-1234567890',
    WHATSAPP_PHONE_NUMBER_ID: '404655686058819',
    WHATSAPP_RECIPIENT_PHONE: '972500000000',
    WHATSAPP_TEMPLATE_NAME: 'order_status',
    WHATSAPP_LANGUAGE_CODE: 'he',
    WHATSAPP_GRAPH_API_VERSION: 'v25.0',
    ...overrides,
  };
}

describe('priority quote WhatsApp integration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('integration definition satisfies the required contract', () => {
    expect(() => validateIntegrationContract(integrationDefinition, { strict: true })).not.toThrow();
  });

  test('dry_run maps CDES to param1 and CPROFNUM to param2 without calling WhatsApp', async () => {
    global.fetch = jest.fn();
    const logger = createLogger();

    const result = await handler.execute({
      payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן' } },
      credentials: credentials(),
      logger,
      executionMode: 'dry_run',
      integration: { name: integrationDefinition.name },
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.requestSummary).toMatchObject({
      endpoint: 'https://graph.facebook.com/v25.0/404655686058819/messages',
      templateName: 'order_status',
      languageCode: 'he',
      recipientPhone: '********0000',
      param2: 'PQ26000001',
      buttonParam: 'PQ26000001',
    });
    expect(result.requestSummary.param1).toMatchObject({ type: 'redacted' });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('test-whatsapp-token');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('דניאל');
  });

  test('live mode posts the expected WhatsApp template request', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              messages: [{ id: 'wamid.test-message' }],
              contacts: [{ input: '972500000000', wa_id: '972500000000' }],
            })
          ),
      })
    );
    const logger = createLogger();

    const result = await handler.execute({
      payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן' } },
      credentials: credentials(),
      logger,
      executionMode: 'live',
      integration: { name: integrationDefinition.name },
    });

    expect(result).toMatchObject({ success: true, providerMessageId: 'wamid.test-message' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v25.0/404655686058819/messages');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer test-whatsapp-token-1234567890',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '972500000000',
      type: 'template',
      template: {
        name: 'order_status',
        language: { code: 'he' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'דניאל כהן' },
              { type: 'text', text: 'PQ26000001' },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: 'PQ26000001' }],
          },
        ],
      },
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('test-whatsapp-token');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('דניאל');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('972500000000');
    expect(result.responseSummary.contacts[0].input).toMatchObject({ type: 'redacted' });
    expect(result.responseSummary.contacts[0].wa_id).toMatchObject({ type: 'redacted' });
  });

  test('live failure message and provider details do not expose raw Meta PII', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                message: 'Invalid recipient 972500000000 for דניאל כהן',
                type: 'OAuthException',
                code: 131000,
                fbtrace_id: 'trace-1',
              },
              contacts: [{ input: '972500000000', wa_id: '972500000000' }],
            })
          ),
      })
    );

    await expect(
      handler.execute({
        payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן' } },
        credentials: credentials(),
        logger: createLogger(),
        executionMode: 'live',
        integration: { name: integrationDefinition.name },
      })
    ).rejects.toThrow('WhatsApp Graph API error (400): Meta rejected the template message request.');

    try {
      await handler.execute({
        payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן' } },
        credentials: credentials(),
        logger: createLogger(),
        executionMode: 'live',
        integration: { name: integrationDefinition.name },
      });
    } catch (err) {
      const serialized = JSON.stringify({ message: err.message, providerError: err.providerError });
      expect(serialized).not.toContain('972500000000');
      expect(serialized).not.toContain('דניאל');
      expect(serialized).not.toContain('test-whatsapp-token');
      expect(err.providerError.responseSummary.contacts[0].input).toMatchObject({ type: 'redacted' });
    }
  });

  test('supports DES as a fallback for CDES', () => {
    expect(handler._diagnostics.getQuoteFields({ CPROF: { CPROFNUM: 'PQ1', DES: 'Customer' } })).toEqual({
      quoteNumber: 'PQ1',
      quoteDescription: 'Customer',
    });
  });
});
