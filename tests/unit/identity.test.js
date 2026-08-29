const {
  deriveUserUid,
  deriveAutomationId,
} = require('../../src/core/identity');

describe('permanent identity helpers', () => {
  test('derives the same user_uid from the same stable slug', () => {
    expect(deriveUserUid('User_001')).toBe(deriveUserUid('user_001'));
    expect(deriveUserUid('user_001')).toMatch(/^usr_[a-f0-9]{16}$/);
  });

  test('derives stable, distinct automation_id values for distinct logical automations', () => {
    const base = {
      integrationKey: 'int_4d6a8c2f9e1b7350',
      userUid: deriveUserUid('user_001'),
      slug: 'echo-fixture',
      codeFolder: 'src/integrations/test_fixtures/echo',
    };
    expect(deriveAutomationId(base)).toBe(deriveAutomationId({ ...base }));
    expect(deriveAutomationId(base)).toMatch(/^aut_[a-f0-9]{16}$/);
    expect(deriveAutomationId(base)).not.toBe(deriveAutomationId({ ...base, userUid: deriveUserUid('user_002') }));
  });

  test('rejects identity derivation without stable input', () => {
    expect(() => deriveUserUid('')).toThrow(/user slug/);
    expect(() => deriveAutomationId({})).toThrow(/stable integration identity/);
  });
});
