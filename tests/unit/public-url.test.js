const fs = require('fs');
const os = require('os');
const path = require('path');

const publicUrl = require('../../src/core/public-url');

describe('public-url', () => {
  const originalEnv = { ...process.env };
  let tempDir;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PUBLIC_BASE_URL;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-public-url-'));
    process.env.NGROK_PUBLIC_URL_FILE = path.join(tempDir, 'ngrok-url.txt');
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns relative paths when no public base URL is configured', () => {
    expect(publicUrl.buildPublicUrl('/webhooks/user/integration')).toBe('/webhooks/user/integration');
  });

  test('uses PUBLIC_BASE_URL first', () => {
    process.env.PUBLIC_BASE_URL = 'https://example.ngrok-free.app/';

    expect(publicUrl.buildPublicUrl('/webhooks/user/integration')).toBe(
      'https://example.ngrok-free.app/webhooks/user/integration'
    );
  });

  test('uses the ngrok public URL file when present', () => {
    process.env.NODE_ENV = 'development';
    fs.writeFileSync(process.env.NGROK_PUBLIC_URL_FILE, 'https://abc.ngrok-free.app\n');

    expect(publicUrl.buildPublicUrl('webhooks/user/integration')).toBe(
      'https://abc.ngrok-free.app/webhooks/user/integration'
    );
  });

  test('does not rewrite already absolute URLs', () => {
    process.env.PUBLIC_BASE_URL = 'https://example.ngrok-free.app';

    expect(publicUrl.buildPublicUrl('https://provider.example/webhook')).toBe('https://provider.example/webhook');
  });
});
