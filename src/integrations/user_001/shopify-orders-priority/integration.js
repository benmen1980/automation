module.exports = {
  name: 'Shopify Orders to Priority',
  description: 'Webhook that receives Shopify orders and creates matching Priority orders.',
  type: 'webhook',
  manualRun: true,
  webhook: { method: 'POST', requiresToken: true },
  testing: { allowManualPayload: true, allowDryRun: true, allowMockOutput: true, allowReplay: true, defaultMode: 'test' },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true }
  ],
  testPayloads: [
    { name: 'Shopify paid order', payload: { id: 501, name: '#1001', customer: { email: 'buyer@example.com', first_name: 'Dana', last_name: 'Levi' }, line_items: [{ sku: 'SKU-100', quantity: 2, price: '49.90' }] } }
  ]
};
