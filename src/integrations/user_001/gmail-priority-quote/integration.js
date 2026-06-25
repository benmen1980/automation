module.exports = {
  name: 'Gmail Quote Request to Priority',
  description: 'Webhook that receives Gmail quote-request data and opens a quote in Priority.',
  type: 'webhook',
  manualRun: true,
  webhook: { method: 'POST', requiresToken: true },
  testing: { allowManualPayload: true, allowDryRun: true, allowMockOutput: true, allowReplay: true, defaultMode: 'test' },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true }
  ],
  testPayloads: [
    { name: 'Quote request email', payload: { email: 'lead@example.com', subject: 'Quote for SKU-QUOTE-1', body: 'Please send a quote for one unit of SKU-QUOTE-1.' } }
  ]
};
