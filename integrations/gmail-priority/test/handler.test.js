import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/handler.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test('creates a Priority quote from a Gmail quote payload using fixture mocks', async () => {
  const result = await handler({
    id: 'test-job',
    payload: {
      email: 'buyer@example.com',
      subject: 'Need quote',
      body: 'Please quote SKU-ABC-1.',
    },
    credentials: { PRIORITY_BASE_URL: 'https://priority.example.test' },
    mocks: { priorityCreateQuote: { mocked: true, priorityQuoteId: 'quote-123' } },
  }, {
    logger,
    config: { credentials: { PRIORITY_BASE_URL: 'https://priority.example.test' } },
    mocks: { priorityCreateQuote: { mocked: true, priorityQuoteId: 'quote-123' } },
  });

  assert.equal(result.success, true);
  assert.equal(result.quote.sku, 'SKU-ABC-1');
  assert.equal(result.result.priorityQuoteId, 'quote-123');
});

test('fails with an actionable validation error when the email body is missing', async () => {
  await assert.rejects(
    () => handler({ id: 'bad-job', payload: { email: 'buyer@example.com' } }, { logger, config: { credentials: {} } }),
    /Payload must include email and body/
  );
});
