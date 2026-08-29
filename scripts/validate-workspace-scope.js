#!/usr/bin/env node
const { execFileSync } = require('child_process');
const {
  PLATFORM_SCOPE,
  AUTOMATION_SCOPE,
  validateWorkspaceScope,
} = require('../src/core/workspace-scope');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function changedFiles() {
  const explicit = argument('--files');
  if (explicit) return explicit.split(/[\r\n,]+/).map((file) => file.trim()).filter(Boolean);
  const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  return `${tracked}\n${untracked}`.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
}

function main() {
  const rawScope = argument('--scope') || process.env.CODEX_SCOPE;
  const scope = String(rawScope || '').toUpperCase() === 'PLATFORM' ? PLATFORM_SCOPE :
    String(rawScope || '').toUpperCase() === 'AUTOMATION' ? AUTOMATION_SCOPE : rawScope;
  const automationId = argument('--automation-id') || process.env.CODEX_AUTOMATION_ID;
  const branch = argument('--branch') || process.env.CODEX_BRANCH || execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  const allowAutomationId = argument('--allow-automation-id');
  const foundationalInfrastructure = argument('--foundational-infra') === 'true' || process.env.CODEX_FOUNDATIONAL_INFRA === 'true';
  const result = validateWorkspaceScope({ scope, automationId, branch, changedFiles: changedFiles(), allowAutomationId, foundationalInfrastructure });
  console.log(`Workspace scope valid: ${result.scope}${result.automationId ? ` ${result.automationId}` : ''}; ${result.changedFiles.length} changed path(s) checked.`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
