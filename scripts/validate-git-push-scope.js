#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const {
  PLATFORM_SCOPE,
  AUTOMATION_SCOPE,
  validateWorkspaceScope,
} = require('../src/core/workspace-scope');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function changedFiles(oldRevision, newRevision) {
  if (/^0+$/.test(oldRevision)) {
    return git(['diff-tree', '--no-commit-id', '--name-only', '-r', newRevision])
      .split(/\r?\n/).filter(Boolean);
  }
  return git(['diff', '--name-only', `${oldRevision}..${newRevision}`])
    .split(/\r?\n/).filter(Boolean);
}

function requiredScope() {
  const scope = String(process.env.CODEX_SCOPE || '').trim().toUpperCase();
  if (scope === PLATFORM_SCOPE) return { scope };
  if (scope === AUTOMATION_SCOPE) {
    const automationId = String(process.env.CODEX_AUTOMATION_ID || '').trim();
    if (!automationId) throw new Error('CODEX_AUTOMATION_ID is required for AUTOMATION scope.');
    return { scope, automationId };
  }
  throw new Error(`CODEX_SCOPE must be ${PLATFORM_SCOPE} or ${AUTOMATION_SCOPE}; refusing push.`);
}

function main() {
  const scope = requiredScope();
  const input = require('node:fs').readFileSync(0, 'utf8');
  const refs = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const files = [...new Set(refs.flatMap((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    return localRef && localSha && remoteRef && remoteSha ? changedFiles(remoteSha, localSha) : [];
  }))];
  if (files.length === 0) {
    console.log('Scope validation passed: no changed files in the push.');
    return;
  }
  validateWorkspaceScope({
    ...scope,
    branch: process.env.CODEX_BRANCH || git(['branch', '--show-current']),
    changedFiles: files,
    allowAutomationId: process.env.CODEX_ALLOW_AUTOMATION_ID,
    foundationalInfrastructure: process.env.CODEX_FOUNDATIONAL_INFRA === 'true',
  });
  console.log(`Scope validation passed: ${scope.scope}${scope.automationId ? ` ${scope.automationId}` : ''}; ${files.length} pushed path(s) checked.`);
}

try {
  main();
} catch (error) {
  console.error(`Push rejected: ${error.message}`);
  process.exitCode = 1;
}
