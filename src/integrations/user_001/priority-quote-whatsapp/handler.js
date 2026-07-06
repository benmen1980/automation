const DEFAULT_GRAPH_HOST = 'https://graph.facebook.com';
const priority = require('priority-web-sdk');
const PRIORITY_QUOTE_NUMBER_SORT_OPTION = 'לפי מספר ההצעה';

function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length <= 4) return '***';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function normalizeApiVersion(version) {
  const trimmed = String(version || 'v25.0').trim();
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

function getQuoteFields(payload) {
  const quote = payload?.CPROF;
  if (!quote || typeof quote !== 'object') {
    throw new Error('Priority webhook payload must include CPROF.');
  }

  const quoteNumber = String(quote.CPROFNUM || '').trim();
  const quoteDescription = String(quote.CDES || quote.DES || '').trim();
  const recipientPhone = String(quote.ROYY_PHONE || '').trim();

  if (!quoteNumber) throw new Error('Priority webhook payload is missing CPROF.CPROFNUM.');
  if (!quoteDescription) throw new Error('Priority webhook payload is missing CPROF.CDES.');
  if (!recipientPhone) throw new Error('Priority webhook payload is missing CPROF.ROYY_PHONE.');

  return { quoteNumber, quoteDescription, recipientPhone };
}

function buildEndpoint(credentials) {
  const apiVersion = normalizeApiVersion(credentials.WHATSAPP_GRAPH_API_VERSION);
  const phoneNumberId = String(credentials.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (!phoneNumberId) throw new Error('Missing WhatsApp Phone Number ID credential.');
  return `${DEFAULT_GRAPH_HOST}/${apiVersion}/${phoneNumberId}/messages`;
}

function getPriorityPrintConfig(credentials) {
  const url = String(credentials.PRIORITY_WEB_SDK_URL || '').trim();
  const username = String(credentials.PRIORITY_WEB_SDK_USERNAME || '').trim();
  const password = String(credentials.PRIORITY_WEB_SDK_PASSWORD || '').trim();
  const company = String(credentials.PRIORITY_WEB_SDK_COMPANY || '').trim();

  if (!url) throw new Error('Missing Priority Web SDK URL credential.');
  if (!username) throw new Error('Missing Priority Web SDK username credential.');
  if (!password) throw new Error('Missing Priority Web SDK password credential.');
  if (!company) throw new Error('Missing Priority Web SDK company credential.');

  return {
    url,
    tabulaini: String(credentials.PRIORITY_WEB_SDK_TABULAINI || 'tabula.ini').trim(),
    language: Number(credentials.PRIORITY_WEB_SDK_LANGUAGE || 1),
    profile: { company },
    appname: String(credentials.PRIORITY_WEB_SDK_APPNAME || company).trim(),
    username,
    password,
    devicename: String(credentials.PRIORITY_WEB_SDK_DEVICENAME || '').trim(),
  };
}

function buildMockPriorityPrintUrl({ credentials, quoteNumber }) {
  const baseUrl = String(credentials.PRIORITY_WEB_SDK_URL || 'https://priority.example.test/wcf/wcf/Service.svc').trim();
  const url = new URL('/priority-print/price-quotation', baseUrl);
  url.searchParams.set('quote', quoteNumber);
  return url.toString();
}

async function generatePriorityPrintUrl({ quoteNumber, credentials }) {
  let procedure;
  const config = getPriorityPrintConfig(credentials);

  await priority.login(config);

  try {
    procedure = await priority.procStart('WWWSHOWCPROF', 'P', null);
    procedure = await procedure.proc.inputOptions(1, 1);
    procedure = await procedure.proc.inputFields(1, {
      EditFields: [
        { field: 1, op: 0, value: quoteNumber },
        { field: 2, op: 0, value: PRIORITY_QUOTE_NUMBER_SORT_OPTION },
      ],
    });
    procedure = await procedure.proc.continueProc();

    const reportUrl = procedure?.Urls?.[0]?.url;
    if (!reportUrl) {
      throw new Error('Priority did not return a price quotation print URL.');
    }

    return new URL(reportUrl, config.url).toString();
  } finally {
    if (procedure?.proc?.cancel) {
      await procedure.proc.cancel().catch(() => {});
    }
  }
}

async function resolvePriorityPrintUrl({ quoteNumber, credentials, executionMode }) {
  if (executionMode === 'dry_run' || executionMode === 'test' || executionMode === 'mock_output') {
    return {
      priorityPrintUrl: buildMockPriorityPrintUrl({ credentials, quoteNumber }),
      mocked: true,
    };
  }

  return {
    priorityPrintUrl: await generatePriorityPrintUrl({ quoteNumber, credentials }),
    mocked: false,
  };
}

function getWhatsappButtonUrlParameter(priorityPrintUrl, credentials = {}) {
  const value = String(priorityPrintUrl || '').trim();
  if (!value) throw new Error('Missing Priority print URL for WhatsApp button parameter.');

  const configuredPrefix = String(credentials.WHATSAPP_BUTTON_URL_PREFIX || '').trim();
  if (configuredPrefix && value.startsWith(configuredPrefix)) {
    return value.slice(configuredPrefix.length);
  }

  try {
    const url = new URL(value);
    const fileName = url.pathname.split('/').filter(Boolean).pop();
    if (fileName) return `${fileName}${url.search || ''}`;
  } catch {
    // Fall through to the original value for non-URL button parameters.
  }

  return value;
}

function buildTemplateBody({ credentials, quoteNumber, quoteDescription, recipientPhone, priorityPrintUrl }) {
  const to = String(recipientPhone || '').trim();
  const templateName = String(credentials.WHATSAPP_TEMPLATE_NAME || 'order_status').trim();
  const languageCode = String(credentials.WHATSAPP_LANGUAGE_CODE || 'he').trim();
  const documentUrlButtonParameter = getWhatsappButtonUrlParameter(priorityPrintUrl, credentials);

  if (!to) throw new Error('Missing recipient phone number in Priority payload CPROF.ROYY_PHONE.');
  if (!templateName) throw new Error('Missing WhatsApp template name credential.');
  if (!languageCode) throw new Error('Missing WhatsApp template language code credential.');

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: quoteDescription },
            { type: 'text', text: quoteNumber },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: documentUrlButtonParameter }],
        },
      ],
    },
  };
}

function safeWhatsAppRequestJson({ endpoint, body, priorityPrintUrl }) {
  const buttonComponent = body.template.components.find((component) => component.type === 'button');
  return {
    endpoint,
    method: 'POST',
    priorityDocumentUrl: priorityPrintUrl,
    body: {
      messaging_product: body.messaging_product,
      to: maskPhone(body.to),
      type: body.type,
      template: {
        name: body.template.name,
        language: body.template.language,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: { type: 'redacted', reason: 'sensitive personal data', length: body.template.components[0].parameters[0].text.length } },
              body.template.components[0].parameters[1],
            ],
          },
          buttonComponent
            ? {
                ...buttonComponent,
                parameters: buttonComponent.parameters.map((parameter) => ({
                  ...parameter,
                  text: parameter.text,
                })),
              }
            : undefined,
        ],
      },
    },
  };
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-url';
  }
}

function safePriorityPrintUrlSummary(priorityPrintUrl) {
  return {
    available: Boolean(priorityPrintUrl),
    host: safeUrlHost(priorityPrintUrl),
  };
}

function safePriorityJson({ quoteNumber, quoteDescription, recipientPhone }) {
  return {
    CPROF: {
      CPROFNUM: quoteNumber,
      CDES: { type: 'redacted', reason: 'sensitive personal data', length: quoteDescription.length },
      ROYY_PHONE: maskPhone(recipientPhone),
    },
  };
}

function safeIncomingPriorityPayloadSummary(payload) {
  if (!payload || typeof payload !== 'object') {
    return { type: typeof payload, hasCPROF: false };
  }
  const quote = payload.CPROF;
  if (!quote || typeof quote !== 'object') {
    return { type: 'object', keys: Object.keys(payload), hasCPROF: false };
  }
  return {
    CPROF: {
      keys: Object.keys(quote),
      CPROFNUM: quote.CPROFNUM ? String(quote.CPROFNUM) : undefined,
      CDES: quote.CDES ? { type: 'redacted', reason: 'sensitive personal data', length: String(quote.CDES).length } : undefined,
      DES: quote.DES ? { type: 'redacted', reason: 'sensitive personal data', length: String(quote.DES).length } : undefined,
      ROYY_PHONE: quote.ROYY_PHONE ? maskPhone(quote.ROYY_PHONE) : undefined,
    },
  };
}

function safeWhatsAppResponseSummary(responseBody) {
  const messages = Array.isArray(responseBody?.messages)
    ? responseBody.messages.map((message) => ({
        id: message?.id || null,
        message_status: message?.message_status || undefined,
      }))
    : undefined;
  const contacts = Array.isArray(responseBody?.contacts)
    ? responseBody.contacts.map((contact) => ({
        input: contact?.input ? { type: 'redacted', reason: 'sensitive personal data' } : undefined,
        wa_id: contact?.wa_id ? { type: 'redacted', reason: 'sensitive personal data' } : undefined,
      }))
    : undefined;
  const error = responseBody?.error
    ? {
        message: responseBody.error.message
          ? 'Provider returned an error message. Details redacted because it can contain recipient data.'
          : undefined,
        type: responseBody.error.type,
        code: responseBody.error.code,
        error_subcode: responseBody.error.error_subcode,
        fbtrace_id: responseBody.error.fbtrace_id,
      }
    : undefined;

  return {
    messaging_product: responseBody?.messaging_product,
    messages,
    contacts,
    error,
  };
}

async function postTemplateMessage({ endpoint, accessToken, body }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = text ? JSON.parse(text) : {};
  } catch {
    responseBody = { raw: text };
  }

  if (!response.ok) {
    const responseSummary = safeWhatsAppResponseSummary(responseBody);
    const err = new Error(
      `WhatsApp Graph API error (${response.status}): Meta rejected the template message request. Check the access token, phone number ID, recipient, template name, language, and approved template parameters.`
    );
    err.providerError = {
      api: 'Meta WhatsApp Cloud API',
      endpoint,
      httpStatus: response.status,
      responseSummary,
      explanation: 'Meta rejected the WhatsApp template message request.',
    };
    throw err;
  }

  return responseBody;
}

module.exports = {
  async execute({ payload, credentials, logger, executionMode, integration }) {
    const { quoteNumber, quoteDescription, recipientPhone } = getQuoteFields(payload);
    const endpoint = buildEndpoint(credentials);
    const { priorityPrintUrl, mocked: priorityPrintUrlMocked } = await resolvePriorityPrintUrl({
      quoteNumber,
      credentials,
      executionMode,
    });
    const body = buildTemplateBody({ credentials, quoteNumber, quoteDescription, recipientPhone, priorityPrintUrl });
    const priorityJson = safePriorityJson({ quoteNumber, quoteDescription, recipientPhone });
    const whatsappJson = safeWhatsAppRequestJson({ endpoint, body, priorityPrintUrl });

    await logger.info('JSON from Priority.', {
      integrationName: integration?.name,
      direction: 'Received from Priority',
      priorityJson,
      quoteNumber,
    });

    await logger.info('Priority print URL prepared before WhatsApp post.', {
      integrationName: integration?.name,
      direction: 'Received from Priority',
      quoteNumber,
      mocked: priorityPrintUrlMocked,
      priorityPrintUrl: safePriorityPrintUrlSummary(priorityPrintUrl),
    });

    await logger.info('JSON to WhatsApp.', {
      integrationName: integration?.name,
      direction: 'Sent to WhatsApp',
      whatsappJson,
    });

    if (executionMode === 'dry_run' || executionMode === 'test') {
      await logger.info('WhatsApp response.', {
        direction: 'Received from WhatsApp',
        executionMode,
        skipped: true,
        whatsappResponseJson: { skipped: true, reason: 'Safe mode does not call WhatsApp.' },
      });
      return {
        success: true,
        skipped: true,
        executionMode,
        message: `WhatsApp template request prepared for Priority quote ${quoteNumber}.`,
        requestSummary: whatsappJson,
      };
    }

    if (executionMode === 'mock_output') {
      const mockResponse = { messages: [{ id: `mock-whatsapp-${quoteNumber}` }] };
      const responseSummary = safeWhatsAppResponseSummary(mockResponse);
      await logger.info('WhatsApp response.', {
        direction: 'Received from WhatsApp',
        mocked: true,
        whatsappResponseJson: responseSummary,
      });
      return {
        success: true,
        mocked: true,
        providerMessageId: mockResponse.messages[0].id,
        requestSummary: whatsappJson,
        responseSummary,
      };
    }

    const accessToken = String(credentials.WHATSAPP_ACCESS_TOKEN || '').trim();
    if (!accessToken) throw new Error('Missing WhatsApp access token credential.');

    const responseBody = await postTemplateMessage({ endpoint, accessToken, body });
    const responseSummary = safeWhatsAppResponseSummary(responseBody);
    const providerMessageId = responseBody?.messages?.[0]?.id || null;

    await logger.info('WhatsApp response.', {
      direction: 'Received from WhatsApp',
      providerMessageId,
      whatsappResponseJson: responseSummary,
    });

    return {
      success: true,
      providerMessageId,
      message: `WhatsApp notification sent for Priority quote ${quoteNumber}.`,
      requestSummary: whatsappJson,
      responseSummary,
    };
  },
  _diagnostics: {
    buildEndpoint,
    buildTemplateBody,
    getQuoteFields,
    maskPhone,
    safeWhatsAppRequestJson,
    safePriorityJson,
    safeIncomingPriorityPayloadSummary,
    safeWhatsAppResponseSummary,
    buildMockPriorityPrintUrl,
    getWhatsappButtonUrlParameter,
    getPriorityPrintConfig,
    resolvePriorityPrintUrl,
    safePriorityPrintUrlSummary,
  },
};
