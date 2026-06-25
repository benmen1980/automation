import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/handler.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test('maps a Salesforce opportunity into a Priority quote', async () => {
  const result = await handler({
    id: 'salesforce-test',
    payload: {
      opportunityId: '006-1',
      accountName: 'ACME',
      amount: 42,
      stage: 'Proposal',
    },
  }, {
    logger,
    config: { credentials: { PRIORITY_BASE_URL: 'https://priority.example.test' } },
    mocks: { priorityCreateQuote: { mocked: true, priorityQuoteId: 'sf-quote-1' } },
  });

  assert.equal(result.success, true);
  assert.equal(result.quote.customerName, 'ACME');
  assert.equal(result.result.priorityQuoteId, 'sf-quote-1');
});
