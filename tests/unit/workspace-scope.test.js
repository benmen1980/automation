const {
  PLATFORM_SCOPE,
  AUTOMATION_SCOPE,
  branchAllowed,
  validateWorkspaceScope,
} = require('../../src/core/workspace-scope');

describe('workspace and Git scope enforcement', () => {
  const automationId = 'aut_bf16311b2c39c038';

  test('automation scope permits its package and legacy runtime paths', () => {
    const result = validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `codex/automation/${automationId}/feature`,
      changedFiles: [
        `automations/${automationId}_priority-inventory-to-file/automation.json`,
        'src/integrations/user_001/priority-inventory-to-file/handler.js',
      ],
    });
    expect(result.changedFiles).toHaveLength(2);
  });

  test('automation scope permits UI paths inside its automation package', () => {
    const result = validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `automation/${automationId}/feature`,
      changedFiles: [
        `automations/${automationId}_priority-inventory-to-file/ui/AutomationModules.jsx`,
      ],
    });
    expect(result.changedFiles).toHaveLength(1);
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `automation/${automationId}/feature`,
      changedFiles: ['frontend/dashboard/src/components/AutomationModules.jsx'],
    })).toThrow('Workspace scope violation');
  });

  test('automation scope rejects another automation and platform files', () => {
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `automation/${automationId}/feature`,
      changedFiles: ['src/core/logger.js'],
    })).toThrow('Workspace scope violation');
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `automation/${automationId}/feature`,
      changedFiles: ['automations/aut_13a032daadd81f2e_user-001-whatsapp/automation.json'],
    })).toThrow('Workspace scope violation');
  });

  test('platform scope requires explicit automation authorization for automation package writes', () => {
    expect(branchAllowed(PLATFORM_SCOPE, 'codex/platform/phase6')).toBe(true);
    expect(() => validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'codex/platform/phase6',
      changedFiles: ['automations/aut_bf16311b2c39c038_priority-inventory-to-file/automation.json'],
    })).toThrow('Workspace scope violation');
    expect(validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'codex/platform/phase6',
      allowAutomationId: automationId,
      changedFiles: ['automations/aut_bf16311b2c39c038_priority-inventory-to-file/automation.json'],
    }).changedFiles).toHaveLength(1);
    expect(() => validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'codex/platform/phase6',
      changedFiles: ['src/integrations/user_001/priority-inventory-to-file/handler.js'],
    })).toThrow('Workspace scope violation');
  });

  test('rejects traversal paths and mismatched branch names', () => {
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'codex/platform/wrong-scope',
      changedFiles: [],
    })).toThrow('Branch');
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: `automation/${automationId}/feature`,
      changedFiles: ['automations/../src/core/logger.js'],
    })).toThrow('Unsafe changed path');
  });
});
