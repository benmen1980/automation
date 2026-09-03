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
      branch: 'master',
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
      branch: 'master',
      changedFiles: [
        `automations/${automationId}_priority-inventory-to-file/ui/AutomationModules.jsx`,
      ],
    });
    expect(result.changedFiles).toHaveLength(1);
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'master',
      changedFiles: ['frontend/dashboard/src/components/AutomationModules.jsx'],
    })).toThrow('Workspace scope violation');
  });

  test('automation scope rejects another automation and platform files', () => {
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'master',
      changedFiles: ['src/core/logger.js'],
    })).toThrow('Workspace scope violation');
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'master',
      changedFiles: ['automations/aut_13a032daadd81f2e_user-001-whatsapp/automation.json'],
    })).toThrow('Workspace scope violation');
  });

  test('platform scope requires explicit automation authorization for automation package writes', () => {
    expect(branchAllowed(PLATFORM_SCOPE, 'master')).toBe(true);
    expect(() => validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'master',
      changedFiles: ['automations/aut_bf16311b2c39c038_priority-inventory-to-file/automation.json'],
    })).toThrow('Workspace scope violation');
    expect(validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'master',
      allowAutomationId: automationId,
      changedFiles: ['automations/aut_bf16311b2c39c038_priority-inventory-to-file/automation.json'],
    }).changedFiles).toHaveLength(1);
    expect(() => validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'master',
      changedFiles: ['src/integrations/user_001/priority-inventory-to-file/handler.js'],
    })).toThrow('Workspace scope violation');
  });

  test('foundational infrastructure scope may span automation packages', () => {
    const result = validateWorkspaceScope({
      scope: PLATFORM_SCOPE,
      branch: 'master',
      foundationalInfrastructure: true,
      changedFiles: [
        'src/core/workspace-scope.js',
        'automations/aut_ea71be6b4ff0780f_priority-order-itc/automation.json',
      ],
    });
    expect(result.foundationalInfrastructure).toBe(true);
  });

  test('priority-order-itc automation owns its worker source and tests', () => {
    const priorityOrderId = 'aut_ea71be6b4ff0780f';
    const result = validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId: priorityOrderId,
      branch: 'master',
      changedFiles: [
        'integrations/priority-order-itc/src/handler.js',
        'integrations/priority-order-itc/src/manifest.js',
        'integrations/priority-order-itc/test/handler.test.js',
      ],
    });
    expect(result.changedFiles).toHaveLength(3);
  });

  test('rejects traversal paths and mismatched branch names', () => {
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'feature/wrong-scope',
      changedFiles: [],
    })).toThrow('Branch');
    expect(() => validateWorkspaceScope({
      scope: AUTOMATION_SCOPE,
      automationId,
      branch: 'master',
      changedFiles: ['automations/../src/core/logger.js'],
    })).toThrow('Unsafe changed path');
  });
});
