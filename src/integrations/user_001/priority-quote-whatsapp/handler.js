const DEFAULT_GRAPH_HOST = 'https://graph.facebook.com';
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

function buildTemplateBody({ credentials, quoteNumber, quoteDescription, recipientPhone }) {
  const to = String(recipientPhone || '').trim();
  const templateName = String(credentials.WHATSAPP_TEMPLATE_NAME || 'order_status').trim();
  const languageCode = String(credentials.WHATSAPP_LANGUAGE_CODE || 'he').trim();

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
          parameters: [{ type: 'text', text: quoteNumber }],
        },
      ],
    },
  };
}

function safeWhatsAppRequestJson({ endpoint, body }) {
  return {
    endpoint,
    method: 'POST',
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
          body.template.components[1],
        ],
      },
    },
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
    const body = buildTemplateBody({ credentials, quoteNumber, quoteDescription, recipientPhone });
    const priorityJson = safePriorityJson({ quoteNumber, quoteDescription, recipientPhone });
    const whatsappJson = safeWhatsAppRequestJson({ endpoint, body });

    await logger.info('JSON from Priority.', {
      integrationName: integration?.name,
      direction: 'Received from Priority',
      priorityJson,
      quoteNumber,
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
  },
};
