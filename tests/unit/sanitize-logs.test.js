const { sanitizeLogEntry, sanitizeValue } = require('../../src/utils/sanitize-logs');

describe('sanitize-logs', () => {
  test('redacts a Bearer token embedded in a message string', () => {
    const { message } = sanitizeLogEntry({ message: 'Calling API with Authorization: Bearer abc123XYZ' });
    expect(message).not.toContain('abc123XYZ');
    expect(message).toContain('Bearer [REDACTED]');
  });

  test('redacts token/key/secret/password query params in a message string', () => {
    const { message } = sanitizeLogEntry({ message: 'GET /callback?token=supersecret&other=1' });
    expect(message).not.toContain('supersecret');
  });

  test('does not mangle a message that merely mentions a sensitive word', () => {
    const { message } = sanitizeLogEntry({ message: 'Validating WHATSAPP_TOKEN field presence.' });
    expect(message).toBe('Validating WHATSAPP_TOKEN field presence.');
  });

  test('redacts metadata object keys that look sensitive, at any nesting depth', () => {
    const { metadata } = sanitizeLogEntry({
      message: 'test',
      metadata: {
        password: 'hunter2',
        apiKey: 'sk-123',
        nested: { authToken: 'xyz', safe: 'ok' },
        count: 3,
      },
    });
    expect(metadata.password).toBe('[REDACTED]');
    expect(metadata.apiKey).toBe('[REDACTED]');
    expect(metadata.nested.authToken).toBe('[REDACTED]');
    expect(metadata.nested.safe).toBe('ok');
    expect(metadata.count).toBe(3);
  });

  test('handles circular references in metadata without throwing', () => {
    const obj = { name: 'circular' };
    obj.self = obj;
    expect(() => sanitizeValue(obj)).not.toThrow();
  });
});
