module.exports = {
  name: 'Priority Balance to WhatsApp',
  description: 'Webhook that receives a customer id, reads Priority data, and sends a WhatsApp message.',
  type: 'webhook',
  manualRun: true,
  webhook: { method: 'POST', requiresToken: true },
  testing: { allowManualPayload: true, allowDryRun: true, allowMockOutput: true, allowReplay: true, defaultMode: 'test' },
  credentials: [
    { key: 'PRIORITY_API_URL', label: 'Priority API URL', type: 'url', required: true },
    { key: 'PRIORITY_API_KEY', label: 'Priority API Key', type: 'secret', required: true },
    { key: 'WHATSAPP_TOKEN', label: 'WhatsApp Token', type: 'secret', required: true },
    { key: 'WHATSAPP_API_URL', label: 'WhatsApp API URL', type: 'url', required: true }
  ],
  testPayloads: [
    { name: 'Customer balance notice', payload: { customerId: 'CUST-100', phone: '972501234567', customerName: 'Dana Levi' } }
  ]
};
