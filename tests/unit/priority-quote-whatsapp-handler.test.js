jest.mock('priority-web-sdk', () => ({
  login: jest.fn(() => Promise.resolve()),
  procStart: jest.fn(),
}));

const priority = require('priority-web-sdk');
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
    WHATSAPP_TEMPLATE_NAME: 'order_status',
    WHATSAPP_LANGUAGE_CODE: 'he',
    WHATSAPP_GRAPH_API_VERSION: 'v25.0',
    WHATSAPP_BUTTON_URL_PREFIX: 'https://priority.example.test/reports/',
    PRIORITY_WEB_SDK_URL: 'https://priority.example.test/wcf/wcf/Service.svc',
    PRIORITY_WEB_SDK_TABULAINI: 'tabula.ini',
    PRIORITY_WEB_SDK_LANGUAGE: 1,
    PRIORITY_WEB_SDK_COMPANY: 'demo',
    PRIORITY_WEB_SDK_APPNAME: 'demo',
    PRIORITY_WEB_SDK_USERNAME: 'shely.l',
    PRIORITY_WEB_SDK_PASSWORD: 'priority-password',
    PRIORITY_WEB_SDK_DEVICENAME: '',
    ...overrides,
  };
}

function mockPriorityPrintUrl(reportUrl = '/reports/PQ26000001.htm') {
  const cancel = jest.fn(() => Promise.resolve());
  const continueProc = jest.fn(() => Promise.resolve({ Urls: [{ url: reportUrl }], proc: { cancel } }));
  const inputFields = jest.fn(() => Promise.resolve({ proc: { continueProc, cancel } }));
  const inputOptions = jest.fn(() => Promise.resolve({ proc: { inputFields, cancel } }));
  priority.procStart.mockResolvedValue({ proc: { inputOptions, cancel } });
  return { inputOptions, inputFields, continueProc, cancel };
}

describe('priority quote WhatsApp integration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    priority.login.mockClear();
    priority.procStart.mockClear();
    jest.restoreAllMocks();
  });

  test('integration definition satisfies the required contract', () => {
    expect(() => validateIntegrationContract(integrationDefinition, { strict: true })).not.toThrow();
  });

  test('dry_run maps CDES to param1 and CPROFNUM to param2 without calling WhatsApp', async () => {
    global.fetch = jest.fn();
    const logger = createLogger();

    const result = await handler.execute({
      payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן', ROYY_PHONE: '972500000000' } },
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
      method: 'POST',
      body: {
        messaging_product: 'whatsapp',
        to: '********0000',
        type: 'template',
        template: {
          name: 'order_status',
          language: { code: 'he' },
        },
      },
    });
    expect(result.requestSummary.body.template.components[0].parameters[0].text).toMatchObject({ type: 'redacted' });
    expect(result.requestSummary.body.template.components[0].parameters[1].text).toBe('PQ26000001');
    expect(result.requestSummary.body.template.components[1].parameters[0].text).toBe(
      'price-quotation?quote=PQ26000001'
    );
    expect(priority.login).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('test-whatsapp-token');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('דניאל');
  });

  test('live mode posts the expected WhatsApp template request', async () => {
    const priorityProcedure = mockPriorityPrintUrl('/reports/PQ26000001.htm');
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
      payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן', ROYY_PHONE: '972500000000' } },
      credentials: credentials(),
      logger,
      executionMode: 'live',
      integration: { name: integrationDefinition.name },
    });

    expect(result).toMatchObject({ success: true, providerMessageId: 'wamid.test-message' });
    expect(priority.login).toHaveBeenCalledWith({
      url: 'https://priority.example.test/wcf/wcf/Service.svc',
      tabulaini: 'tabula.ini',
      language: 1,
      profile: { company: 'demo' },
      appname: 'demo',
      username: 'shely.l',
      password: 'priority-password',
      devicename: '',
    });
    expect(priority.procStart).toHaveBeenCalledWith('WWWSHOWCPROF', 'P', null);
    expect(priorityProcedure.inputFields).toHaveBeenCalledWith(1, {
      EditFields: [
        { field: 1, op: 0, value: 'PQ26000001' },
        { field: 2, op: 0, value: 'לפי מספר ההצעה' },
      ],
    });
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
            parameters: [{ type: 'text', text: 'PQ26000001.htm' }],
          },
        ],
      },
    });
    const postedBody = JSON.parse(options.body);
    const buttonComponent = postedBody.template.components.find((component) => component.type === 'button');
    expect(buttonComponent.parameters[0].text).toBe('PQ26000001.htm');
    const whatsappLog = logger.info.mock.calls.find(([message]) => message === 'JSON to WhatsApp.');
    expect(whatsappLog[1].whatsappJson.priorityDocumentUrl).toBe('https://priority.example.test/reports/PQ26000001.htm');
    expect(whatsappLog[1].whatsappJson.body.template.components[1].parameters[0].text).toBe(
      'PQ26000001.htm'
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('test-whatsapp-token');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('priority-password');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('דניאל');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('972500000000');
    expect(result.responseSummary.contacts[0].input).toMatchObject({ type: 'redacted' });
    expect(result.responseSummary.contacts[0].wa_id).toMatchObject({ type: 'redacted' });
  });

  test('live failure message and provider details do not expose raw Meta PII', async () => {
    mockPriorityPrintUrl('/reports/PQ26000001.htm');
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
        payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן', ROYY_PHONE: '972500000000' } },
        credentials: credentials(),
        logger: createLogger(),
        executionMode: 'live',
        integration: { name: integrationDefinition.name },
      })
    ).rejects.toThrow('WhatsApp Graph API error (400): Meta rejected the template message request.');

    try {
      mockPriorityPrintUrl('/reports/PQ26000001.htm');
      await handler.execute({
        payload: { CPROF: { CPROFNUM: 'PQ26000001', CDES: 'דניאל כהן', ROYY_PHONE: '972500000000' } },
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
      expect(serialized).not.toContain('priority-password');
      expect(err.providerError.responseSummary.contacts[0].input).toMatchObject({ type: 'redacted' });
    }
  });

  test('supports DES as a fallback for CDES and uses ROYY_PHONE as recipient', () => {
    expect(handler._diagnostics.getQuoteFields({ CPROF: { CPROFNUM: 'PQ1', DES: 'Customer', ROYY_PHONE: '972511111111' } })).toEqual({
      quoteNumber: 'PQ1',
      quoteDescription: 'Customer',
      recipientPhone: '972511111111',
    });
  });
});
