const fs = require('fs');
const path = require('path');

describe('Git push scope guard', () => {
  test('hook requires an explicit scope before pushing', () => {
    const hook = fs.readFileSync(path.join(__dirname, '../../.githooks/pre-push'), 'utf8');
    expect(hook).toContain('validate-git-push-scope.js');
  });

  test('pre-commit hook validates the complete working-tree scope', () => {
    const hook = fs.readFileSync(path.join(__dirname, '../../.githooks/pre-commit'), 'utf8');
    expect(hook).toContain('validate-workspace-scope.js');
  });

  test('scope installer configures the repository hook path', () => {
    const installer = fs.readFileSync(path.join(__dirname, '../../scripts/install-git-hooks.js'), 'utf8');
    expect(installer).toContain("core.hooksPath");
    expect(installer).toContain('.githooks');
  });

});
