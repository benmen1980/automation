import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/handler.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test('maps a Shopify order into a Priority order', async () => {
  const result = await handler({
    id: 'shopify-test',
    payload: {
      id: 100,
      name: '#100',
      customer: { email: 'buyer@example.com', first_name: 'Buyer', last_name: 'One' },
      line_items: [{ sku: 'SKU-1', quantity: 3, price: '7.50' }],
    },
  }, {
    logger,
    config: { credentials: { PRIORITY_BASE_URL: 'https://priority.example.test' } },
    mocks: { priorityCreateOrder: { mocked: true, priorityOrderId: 'po-100' } },
  });

  assert.equal(result.success, true);
  assert.equal(result.priorityOrder.lines[0].sku, 'SKU-1');
  assert.equal(result.result.priorityOrderId, 'po-100');
});
