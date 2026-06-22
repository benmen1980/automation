const { slugify } = require('../../src/utils/slugify');

describe('slugify', () => {
  test('lowercases and hyphenates', () => {
    expect(slugify('WhatsApp Order!')).toBe('whatsapp-order');
  });

  test('trims leading/trailing separators', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });

  test('truncates to 80 characters', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBe(80);
  });
});
