module.exports = {
  name: 'Gmail Quote Request to Priority',
  description: 'Webhook that receives Gmail quote-request data and opens a quote in Priority.',
  type: 'webhook',
  manualRun: true,
  connectors: ['gmail', 'priority'],
  credentialTests: ['priority'],
  webhook: { method: 'POST', requiresToken: true },
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-gmail-priority-quote',
    steps: ['Received from Gmail webhook', 'Parsed quote request', 'Sent to Priority', 'Received from Priority'],
  },
  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'mock_output', 'live'],
    modeDescriptions: {
      test: 'Uses the sample Gmail quote payload and saved credentials to test the mapping without requiring a live Gmail inbox.',
      dry_run: 'Validates the quote payload and reports what would be sent to Priority without calling Priority.',
      mock_output: 'Uses mock connector responses so no real external system is called.',
      live: 'Processes the received webhook payload and creates a real Priority quote.',
    },
  },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true, helper: 'Priority API base URL or endpoint used to create quotes.' },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true, helper: 'Priority API token. Stored securely and shown only as saved dots after saving.' }
  ],
  testPayloads: [
    { name: 'Quote request email', payload: { email: 'lead@example.com', subject: 'Quote for SKU-QUOTE-1', body: 'Please send a quote for one unit of SKU-QUOTE-1.' } }
  ]
};
