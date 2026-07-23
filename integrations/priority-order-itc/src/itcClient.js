import client from './itcClient.cjs';

export const {
  getOrderFields,
  mapOrder,
  normalizeRecipientPhone,
  safeDocumentUrlSummary,
  safeRequestSummary,
  safeResponseSummary,
  sanitizeProviderString,
  sendTemplateMessage,
} = client;

export default client;
