import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/lambda.js';

test('lambda accepts API SQS execution job shape', async () => {
  const result = await handler({
    Records: [
      {
        messageId: 'message-1',
        body: JSON.stringify({
          schemaVersion: 1,
          jobType: 'integration-execution',
          id: 'exec-1',
          executionId: 'exec-1',
          integrationSlug: 'gmail-priority',
          mode: 'test',
          executionMode: 'test',
          payload: {
            email: 'lead@example.com',
            subject: 'Quote for SKU-QUOTE-1',
            body: 'Please quote SKU-QUOTE-1.',
          },
        }),
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.results[0].quote.sku, 'SKU-QUOTE-1');
});
