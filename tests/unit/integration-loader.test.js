const integrationLoader = require('../../src/core/integration-loader');

describe('integration-loader', () => {
  test('loads the real whatsapp-order integration.js correctly', () => {
    const definition = integrationLoader.loadDefinition({
      id: 'loader-test-whatsapp',
      codeFolder: 'src/integrations/user_001/whatsapp-order',
      definitionFile: 'integration.js',
    });
    expect(definition.name).toBe('WhatsApp Order Notification');
    expect(definition.type).toBe('webhook');
    expect(Array.isArray(definition.credentials)).toBe(true);
    expect(definition.credentials.find((f) => f.key === 'WHATSAPP_TOKEN')).toBeTruthy();
  });

  test('loads a valid handler.js and it satisfies the execute() contract', () => {
    const handler = integrationLoader.loadHandler({
      id: 'loader-test-whatsapp',
      codeFolder: 'src/integrations/user_001/whatsapp-order',
      handlerFile: 'handler.js',
    });
    expect(typeof handler.execute).toBe('function');
  });

  test('loads the test_fixtures/echo integration used by the integration test suite', () => {
    const definition = integrationLoader.loadDefinition({
      id: 'loader-test-echo',
      codeFolder: 'src/integrations/test_fixtures/echo',
      definitionFile: 'integration.js',
    });
    expect(definition.name).toBe('Test Echo');
    expect(definition.credentials.map((f) => f.key)).toEqual(['API_TOKEN', 'GREETING', 'LEGACY_SECRET']);
  });

  test('refuses to resolve a codeFolder outside of INTEGRATIONS_ROOT', () => {
    expect(() => integrationLoader.resolveSafeFolder('../outside-root')).toThrow();
    expect(() => integrationLoader.resolveSafeFolder('/etc')).toThrow();
  });

  test('refuses a codeFolder that escapes the root via traversal segments', () => {
    expect(() => integrationLoader.resolveSafeFolder('src/integrations/user_001/../../../etc')).toThrow();
  });

  test('validateIntegrationFiles throws when the folder does not exist', () => {
    expect(() =>
      integrationLoader.validateIntegrationFiles('src/integrations/test_fixtures/does-not-exist', 'integration.js', 'handler.js')
    ).toThrow();
  });
});
