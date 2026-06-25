module.exports = {
  name: 'Priority Balance to WhatsApp',
  description: 'Webhook that receives a customer id, reads Priority data, and sends a WhatsApp message.',
  type: 'webhook',
  manualRun: true,
  connectors: ['priority', 'whatsapp'],
  credentialTests: ['priority', 'whatsapp'],
  webhook: { method: 'POST', requiresToken: true },
  logging: {
    direction: 'BIDIRECTIONAL',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-priority-whatsapp',
    steps: ['Received customer request', 'Sent lookup to Priority', 'Received from Priority', 'Sent to WhatsApp'],
  },
  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'mock_output', 'live'],
    modeDescriptions: {
      test: 'Runs the sample customer payload through the handler with saved local credentials.',
      dry_run: 'Validates the customer payload and reports the Priority lookup and WhatsApp message without calling external systems.',
      mock_output: 'Uses mock Priority and WhatsApp connector responses.',
      live: 'Reads real Priority data and sends a real WhatsApp message.',
    },
  },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true, helper: 'Priority API endpoint used to read the customer balance.' },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true, helper: 'Priority API token. Stored securely and never displayed.' },
    { key: 'WHATSAPP_TOKEN', label: 'WhatsApp Token', type: 'secret', required: true, helper: 'WhatsApp provider bearer token. Stored securely and never displayed.' },
    { key: 'WHATSAPP_API_URL', label: 'WhatsApp API URL', type: 'url', required: true, helper: 'WhatsApp provider endpoint used to send messages.' }
  ],
  testPayloads: [
    { name: 'Customer balance notice', payload: { customerId: 'CUST-100', phone: '972501234567', customerName: 'Dana Levi' } }
  ]
};
