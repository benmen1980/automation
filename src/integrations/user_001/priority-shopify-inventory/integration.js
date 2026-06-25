module.exports = {
  name: 'Priority to Shopify Inventory Sync',
  description: 'Scheduled job that reads Priority inventory and captures/posts inventory updates to Shopify.',
  type: 'scheduled',
  manualRun: true,
  connectors: ['priority', 'shopify'],
  credentialTests: ['priority', 'shopify'],
  schedule: { defaultCron: '*/10 * * * *', defaultTimezone: 'Asia/Jerusalem' },
  logging: {
    direction: 'OUTBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-priority-shopify-inventory',
    steps: ['Received from Priority', 'Mapped inventory item', 'Sent to Shopify', 'Received from Shopify'],
  },
  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'mock_output', 'live'],
    modeDescriptions: {
      test: 'Uses sample inventory data to exercise the mapping without requiring a live schedule.',
      dry_run: 'Reports the Shopify inventory updates that would be sent without calling Shopify.',
      mock_output: 'Uses mock Priority and Shopify connector responses.',
      live: 'Reads real Priority inventory and sends real inventory updates to Shopify.',
    },
  },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true, helper: 'Priority API endpoint used to read inventory.' },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true, helper: 'Priority API token. Stored securely and never displayed.' },
    { key: 'SHOPIFY_API_URL', label: 'Shopify API URL', type: 'url', required: true, helper: 'Shopify Admin API endpoint for inventory updates.' },
    { key: 'SHOPIFY_ACCESS_TOKEN', label: 'Shopify Access Token', type: 'secret', required: true, helper: 'Shopify Admin access token. Stored securely and never displayed.' }
  ],
  testPayloads: [
    { name: 'Dummy inventory', payload: { items: [{ sku: 'SKU-100', quantity: 12 }, { sku: 'SKU-200', quantity: 0 }] } }
  ]
};
