module.exports = {
  name: 'Shopify Orders to Priority',
  description: 'Webhook that receives Shopify orders and creates matching Priority orders.',
  type: 'webhook',
  manualRun: true,
  connectors: ['shopify', 'priority'],
  credentialTests: ['priority', 'shopify'],
  webhook: { method: 'POST', requiresToken: true },
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-shopify-orders-priority',
    steps: ['Received from Shopify', 'Mapped order to Priority', 'Sent to Priority', 'Received from Priority'],
  },
  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'mock_output', 'live'],
    modeDescriptions: {
      test: 'Runs the sample Shopify order through the mapping using local test settings.',
      dry_run: 'Validates and maps the Shopify order without creating a Priority order.',
      mock_output: 'Uses mock connector responses so Shopify and Priority are not called.',
      live: 'Creates or updates a real Priority order from the Shopify webhook payload.',
    },
  },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true, helper: 'Priority API endpoint used to create sales orders.' },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true, helper: 'Priority API token. Stored securely and never displayed.' }
  ],
  testPayloads: [
    { name: 'Shopify paid order', payload: { id: 501, name: '#1001', customer: { email: 'buyer@example.com', first_name: 'Dana', last_name: 'Levi' }, line_items: [{ sku: 'SKU-100', quantity: 2, price: '49.90' }] } }
  ]
};
