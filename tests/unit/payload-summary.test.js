const { summarizePayload } = require('../../src/utils/payload-summary');

describe('payload-summary', () => {
  test('summarizes payloads while redacting sensitive fields', () => {
    const summary = summarizePayload({
      orderId: '1001',
      authorization: 'Bearer abc123',
      nested: {
        refreshToken: 'secret-token',
        items: [{ sku: 'SKU-1', qty: 2 }],
      },
    });

    expect(summary.orderId).toBe('1001');
    expect(summary.authorization).toBe('***REDACTED***');
    expect(summary.nested.refreshToken).toBe('***REDACTED***');
    expect(summary.nested.items).toEqual({ type: 'array', length: 1 });
  });

  test('redacts common personal-data fields from payload summaries', () => {
    const summary = summarizePayload({
      customerName: 'Jane Customer',
      email: 'jane@example.com',
      phone: '+972501234567',
      message: 'Please quote this order',
      orderId: '1001',
    });

    expect(summary.customerName).toEqual({ type: 'redacted', reason: 'sensitive personal data' });
    expect(summary.email).toEqual({ type: 'redacted', reason: 'sensitive personal data' });
    expect(summary.phone).toEqual({ type: 'redacted', reason: 'sensitive personal data' });
    expect(summary.message).toEqual({ type: 'redacted', reason: 'sensitive personal data' });
    expect(summary.orderId).toBe('1001');
  });
});
