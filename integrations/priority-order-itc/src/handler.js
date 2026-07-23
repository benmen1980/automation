import { getOrderFields, mapOrder, safeRequestSummary, safeResponseSummary, sanitizeProviderString, sendTemplateMessage } from './itcClient.js';
import priorityWebSdkClient, {
  buildMockSalesOrderPrintUrl,
  safeDocumentUrlSummary,
} from './priorityWebSdkClient.js';
import {
  archivePriorityDocument,
  buildMockServerDocumentUrl,
} from './serverDocumentClient.js';

export async function handler(job, context) {
  const {
    logger,
    config,
    mocks = {},
    fetchImpl,
    documentFetchImpl,
    archiveDocument,
    beforeProviderDelivery,
    priorityClient = priorityWebSdkClient,
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
  const { orderName, customerDescription } = getOrderFields(payload);

  logger.info('Received from Priority.', {
    direction: 'Received from Priority',
    triggerType: job.triggerType || 'queue',
    mode,
    recordsRead: 1,
    payload: {
      ORDERS: {
        ORDNAME: { type: 'redacted', reason: 'sensitive personal data' },
        ZANA_CUSTDES: customerDescription,
        ZANA_PHONENUM: { type: 'redacted', reason: 'sensitive personal data' },
      },
    },
  });

  logger.info('Sent to Priority Web SDK.', {
    direction: 'Sent to Priority',
    action: 'WWWSHOWORDER sales order confirmation',
    procedure: 'WWWSHOWORDER',
    requestSummary: {
      orderName: { type: 'redacted', reason: 'sensitive personal data' },
      sortOption: String(credentials.PRIORITY_WEB_SDK_ORDER_SORT_OPTION || 'By Order Number'),
    },
  });

  const priorityPrintUrl = mode === 'live'
    ? await priorityClient.generateSalesOrderPrintUrl(orderName, credentials)
    : buildMockSalesOrderPrintUrl(orderName);

  logger.info('Received from Priority Web SDK.', {
    direction: 'Received from Priority',
    action: 'WWWSHOWORDER sales order confirmation',
    mocked: mode !== 'live',
    responseSummary: safeDocumentUrlSummary(priorityPrintUrl),
  });

  const sharedDocumentUrl = mode === 'live'
    ? await (
        archiveDocument ||
        ((sourceUrl) =>
          archivePriorityDocument(job, sourceUrl, {
            fetchImpl: documentFetchImpl,
          }))
      )(priorityPrintUrl)
    : buildMockServerDocumentUrl();

  logger.info('Saved Priority document copy on automation server.', {
    direction: 'Stored on automation server',
    mocked: mode !== 'live',
    responseSummary: safeDocumentUrlSummary(sharedDocumentUrl),
  });

  const body = mapOrder(payload, credentials, sharedDocumentUrl);
  const requestSummary = safeRequestSummary(endpoint, body);
  logger.info('Sent to ITC.', { direction: 'Sent to ITC', messagesPrepared: 1, requestSummary });

  if (mode === 'dry_run' || mode === 'test') {
    const responseSummary = { skipped: true, reason: `${mode} mode does not call ITC.` };
    logger.info('Received from ITC.', { direction: 'Received from ITC', messagesSent: 0, recordsSkipped: 1, errors: 0, responseSummary });
    return { success: true, skipped: true, requestSummary, responseSummary, counts: { recordsRead: 1, messagesSent: 0, recordsSkipped: 1, errors: 0 } };
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
  const responseSummary = safeResponseSummary(result.data);
  logger.info('Received from ITC.', { direction: 'Received from ITC', httpStatus: result.status, providerMessageId: result.providerMessageId, messagesSent: 1, recordsSkipped: 0, errors: 0, responseSummary });
  return { success: true, providerMessageId: result.providerMessageId, requestSummary, responseSummary, counts: { recordsRead: 1, messagesSent: 1, recordsSkipped: 0, errors: 0 } };
}
