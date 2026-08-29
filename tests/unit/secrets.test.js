const fs = require('fs');
const os = require('os');
const path = require('path');

describe('secret namespace compatibility', () => {
  let secrets;
  let storePath;
  const originalEnv = {
    SECRETS_MODE: process.env.SECRETS_MODE,
    LOCAL_SECRET_KEY: process.env.LOCAL_SECRET_KEY,
    LOCAL_SECRETS_PATH: process.env.LOCAL_SECRETS_PATH,
  };
  const integration = { id: 'clegacy1', automationId: 'aut_0123456789abcdef' };

  beforeEach(() => {
    jest.resetModules();
    storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'automation-secrets-')), 'secrets.json');
    process.env.SECRETS_MODE = 'local';
    process.env.LOCAL_SECRET_KEY = 'phase4-test-key';
    process.env.LOCAL_SECRETS_PATH = storePath;
    secrets = require('../../src/core/secrets');
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('writes permanent and legacy aliases while returning the permanent reference', async () => {
    const reference = await secrets.setSecret(integration, 'API_TOKEN', 'value-not-printed');
    expect(reference).toBe('automation/aut_0123456789abcdef/API_TOKEN');
    expect(await secrets.getSecret(integration, 'API_TOKEN')).toBe('value-not-printed');
    expect(await secrets.getSecret(integration, 'API_TOKEN', 'clegacy1::API_TOKEN')).toBe('value-not-printed');

    const names = Object.keys(JSON.parse(fs.readFileSync(storePath, 'utf8')));
    expect(names).toEqual(expect.arrayContaining([
      'automation/aut_0123456789abcdef/API_TOKEN',
      'clegacy1::API_TOKEN',
    ]));
  });

  test('legacy-only references remain readable and can be aliased without changing the value', async () => {
    await secrets.setSecret('clegacy1', 'API_TOKEN', 'legacy-value-not-printed');
    const aliased = await secrets.aliasSecret(integration, 'API_TOKEN', 'clegacy1::API_TOKEN');
    expect(aliased).toBe(true);
    expect(await secrets.getSecret(integration, 'API_TOKEN')).toBe('legacy-value-not-printed');
    expect(await secrets.getSecret(integration, 'API_TOKEN', 'clegacy1::API_TOKEN')).toBe('legacy-value-not-printed');
  });

  test('references from another automation are not accepted by the namespace helper', () => {
    expect(secrets.getSecretReferences(integration, 'API_TOKEN')).not.toContain(
      'automation/aut_other_automation/API_TOKEN'
    );
    expect(secrets.getSecret(integration, 'API_TOKEN', 'automation/aut_other_automation/API_TOKEN'))
      .resolves.toBe(null);
    expect(secrets.isReferenceForScope(
      'automation/aut_other_automation/API_TOKEN', integration, 'API_TOKEN'
    )).toBe(false);
  });
});
