import { getDocumentFields, mapDocument, safeRequestSummary, safeResponseSummary, sanitizeProviderString, sendTemplateMessage } from './itcClient.js';
export async function handler(job, context) {
  const {
    logger,
    config,
    mocks = {},
    fetchImpl,
    beforeProviderDelivery,
  } = context;
  const payload = job.payload || {};
  const mode = job.mode || job.executionMode || 'dry_run';
  const allowedModes = ['dry_run', 'test', 'mock_output', 'live'];
  if (!allowedModes.includes(mode)) {
    const error = new Error(`Unsupported execution mode. Allowed modes: ${allowedModes.join(', ')}.`);
    error.retryable = false;
    throw error;
  }
  const credentials = config.credentials || {};
  const endpoint = String(credentials.ITC_TEMPLATE_MESSAGE_URL || '').trim();
  const { orderName, customerDescription, recipientPhone, faxCustomerDescription, faxRecipientPhone } = getDocumentFields(payload);

  if (!recipientPhone && !faxRecipientPhone) {
    return { success: true, skipped: true, responseSummary: { skipped: true, reason: 'No complete recipient name and phone pair.' }, counts: { recordsRead: 1, messagesSent: 0, recordsSkipped: 1, errors: 0 } };
  }

  logger.info('Received from Priority.', {
    direction: 'Received from Priority',
    triggerType: job.triggerType || 'queue',
    mode,
    recordsRead: 1,
    payload: {
      DOCUMENTS_D: {
        ORDNAME: orderName,
        YARD_CUSTDES: customerDescription,
        YARD_PHONENUM: { type: 'redacted', reason: 'sensitive personal data' },
      },
    },
  });

  const body = mapDocument(payload, credentials, recipientPhone ? {} : {
    customerDescription: faxCustomerDescription,
    recipientPhone: faxRecipientPhone,
  });
  const faxBody = recipientPhone && faxRecipientPhone
    ? mapDocument(payload, credentials, {
        customerDescription: faxCustomerDescription,
        recipientPhone: faxRecipientPhone,
      })
    : null;
  const requestSummary = safeRequestSummary(endpoint, body);
  const faxRequestSummary = faxBody ? safeRequestSummary(endpoint, faxBody) : null;
  logger.info('Sent to ITC.', {
    direction: 'Sent to ITC',
    messagesPrepared: faxBody ? 2 : 1,
    requestSummary,
    ...(faxRequestSummary ? { additionalRequestSummary: faxRequestSummary } : {}),
  });

  if (mode === 'dry_run' || mode === 'test') {
    const responseSummary = { skipped: true, reason: `${mode} mode does not call ITC.` };
    logger.info('Received from ITC.', { direction: 'Received from ITC', messagesSent: 0, recordsSkipped: 1, errors: 0, responseSummary });
    return { success: true, skipped: true, requestSummary, ...(faxRequestSummary ? { additionalRequestSummary: faxRequestSummary } : {}), responseSummary, counts: { recordsRead: 1, messagesSent: 0, recordsSkipped: 1, errors: 0 } };
  }

  if (mode === 'mock_output') {
    const mockResponse = mocks.itcResponse || { id: 'mock-itc-message-123', status: 'accepted', mocked: true };
    const responseSummary = safeResponseSummary(mockResponse);
    logger.info('Received from ITC.', { direction: 'Received from ITC', mocked: true, messagesSent: 0, recordsSkipped: 0, errors: 0, responseSummary });
    return {
      success: true,
      mocked: true,
      providerMessageId: mockResponse.id === undefined || mockResponse.id === null
        ? null
        : sanitizeProviderString(mockResponse.id).slice(0, 160),
      requestSummary,
      ...(faxRequestSummary ? { additionalRequestSummary: faxRequestSummary } : {}),
      responseSummary,
      counts: { recordsRead: 1, messagesSent: 0, recordsSkipped: 0, errors: 0 },
    };
  }

  if (mode !== 'live') {
    const error = new Error('ITC delivery is allowed only when execution mode is explicitly live.');
    error.retryable = false;
    throw error;
  }

  const result = await sendTemplateMessage(body, credentials, {
    fetchImpl,
    beforeSend: beforeProviderDelivery,
  });
  const faxResult = faxBody
    ? await sendTemplateMessage(faxBody, credentials, { fetchImpl })
    : null;
  const responseSummary = safeResponseSummary(result.data);
  logger.info('Received from ITC.', { direction: 'Received from ITC', httpStatus: result.status, providerMessageId: result.providerMessageId, messagesSent: faxResult ? 2 : 1, recordsSkipped: 0, errors: 0, responseSummary });
  return {
    success: true,
    providerMessageId: result.providerMessageId,
    ...(faxResult ? { additionalProviderMessageId: faxResult.providerMessageId } : {}),
    requestSummary,
    ...(faxRequestSummary ? { additionalRequestSummary: faxRequestSummary } : {}),
    responseSummary,
    counts: { recordsRead: 1, messagesSent: faxResult ? 2 : 1, recordsSkipped: 0, errors: 0 },
  };
}
