module.exports = {
  name: 'Priority to Shopify Inventory Sync',
  description: 'Scheduled job that reads Priority inventory and captures/posts inventory updates to Shopify.',
  type: 'scheduled',
  manualRun: true,
  schedule: { defaultCron: '*/10 * * * *', defaultTimezone: 'Asia/Jerusalem' },
  testing: { allowManualPayload: true, allowDryRun: true, allowMockOutput: true, allowReplay: true, defaultMode: 'test' },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true },
    { key: 'SHOPIFY_API_URL', label: 'Shopify API URL', type: 'url', required: true },
    { key: 'SHOPIFY_ACCESS_TOKEN', label: 'Shopify Access Token', type: 'secret', required: true }
  ],
  testPayloads: [
    { name: 'Dummy inventory', payload: { items: [{ sku: 'SKU-100', quantity: 12 }, { sku: 'SKU-200', quantity: 0 }] } }
  ]
};
