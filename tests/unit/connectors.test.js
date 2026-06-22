const { getConnectors, getRealConnector } = require('../../src/connectors');

function fakeLogger() {
  const calls = [];
  return {
    async info(message, metadata) {
      calls.push({ level: 'info', message, metadata });
    },
    async debug() {},
    async warning() {},
    async error() {},
    calls,
  };
}

describe('connectors - execution mode switching', () => {
  test('dry_run intercepts every method except testConnection and never reaches the real implementation', async () => {
    const logger = fakeLogger();
    const connectors = getConnectors({ executionMode: 'dry_run', credentials: {}, logger });

    const result = await connectors.whatsapp.sendMessage({ to: '123', message: 'hi' });
    expect(result).toEqual({ success: true, skipped: true, reason: 'dry_run', mocked: false });
    expect(
      logger.calls.some((c) => c.message.includes('skipped because execution mode is dry_run'))
    ).toBe(true);
  });

  test('dry_run still lets testConnection through to the real implementation', async () => {
    const connectors = getConnectors({ executionMode: 'dry_run', credentials: {} });
    const result = await connectors.whatsapp.testConnection({});
    expect(result).toEqual({ success: false, message: 'Missing WHATSAPP_TOKEN or WHATSAPP_API_URL.' });
  });

  test('mock_output returns the mock implementation\'s response, not the real one', async () => {
    const connectors = getConnectors({ executionMode: 'mock_output', credentials: {} });

    const waResult = await connectors.whatsapp.sendMessage({ to: '123', message: 'hi' });
    expect(waResult).toEqual({
      success: true,
      mocked: true,
      providerMessageId: 'mock-message-123',
      request: { to: '123', message: 'hi' },
    });

    const emailResult = await connectors.email.send({ to: 'a@b.com', subject: 's', body: 'b' });
    expect(emailResult.mocked).toBe(true);
  });

  test('live mode binds the real implementation with the supplied credentials (no network call needed to prove it)', async () => {
    const connectors = getConnectors({ executionMode: 'live', credentials: {} });
    // Missing credentials make real.js throw its own validation error before
    // ever calling fetch - this proves the REAL module is wired in, not the
    // mock or the dry-run stub, with zero network access required.
    await expect(connectors.whatsapp.sendMessage({ to: '123', message: 'hi' })).rejects.toThrow(
      'WhatsApp connector requires WHATSAPP_TOKEN and WHATSAPP_API_URL credentials.'
    );
  });

  test('getRealConnector always returns the real implementation regardless of mode', () => {
    const real = getRealConnector('whatsapp');
    expect(real).toBe(require('../../src/connectors/whatsapp/real'));
  });

  test('getRealConnector throws for an unknown connector name', () => {
    expect(() => getRealConnector('not-a-real-connector')).toThrow();
  });
});
