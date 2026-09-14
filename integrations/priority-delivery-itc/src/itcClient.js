import client from './itcClient.cjs';

export const {
  getDocumentFields,
  mapDocument,
  normalizeRecipientPhone,
  safeRequestSummary,
  safeResponseSummary,
  sanitizeProviderString,
  sendTemplateMessage,
} = client;

export default client;
