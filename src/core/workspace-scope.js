const fs = require('fs');
const path = require('path');
const registry = require('./automation-registry');

const PLATFORM_SCOPE = 'PLATFORM/ADMIN';
const AUTOMATION_SCOPE = 'AUTOMATION';

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function pathIsWithin(candidate, parent) {
  const normalizedCandidate = normalizePath(candidate).replace(/\/$/, '');
  const normalizedParent = normalizePath(parent).replace(/\/$/, '');
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function assertSafeRelativePath(relativePath, root = process.cwd()) {
  const normalized = normalizePath(relativePath);
  if (!normalized || path.isAbsolute(relativePath) || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe changed path: ${relativePath}`);
  }
  const resolved = path.resolve(root, normalized);
  if (!pathIsWithin(resolved, root)) throw new Error(`Changed path escapes workspace: ${relativePath}`);
  if (fs.existsSync(resolved)) {
    const realRoot = fs.realpathSync.native(root);
    const realPath = fs.realpathSync.native(resolved);
    if (!pathIsWithin(realPath, realRoot)) throw new Error(`Changed path resolves outside workspace: ${relativePath}`);
  }
  return normalized;
}

function branchAllowed(scope, branch, automationId, allowAutomationId) {
  const value = String(branch || '').trim();
  if (!value) return false;
  if (scope === AUTOMATION_SCOPE) {
    return new RegExp(`^(?:codex/)?automation/${automationId}(?:/|$)`, 'i').test(value);
  }
  if (allowAutomationId) return /^(?:codex\/)?platform(?:\/|$)/i.test(value);
  return /^(?:codex\/)?platform(?:\/|$)|^(?:main|master|develop|staging)$/i.test(value);
}

function manifestAllowedPaths(manifest) {
  const legacy = manifest.compatibility?.legacy || {};
  const paths = [
    manifest.__directory && path.relative(process.cwd(), manifest.__directory),
    manifest.ui?.path,
    manifest.runtime?.entrypoint,
    manifest.runtime?.definition,
    legacy.code_folder,
  ].filter(Boolean).map(normalizePath);
  return [...new Set(paths)];
}

function fileAllowedForAutomation(file, manifest) {
  const normalized = normalizePath(file);
  return manifestAllowedPaths(manifest).some((allowed) => pathIsWithin(normalized, allowed));
}

function validateWorkspaceScope({ scope, automationId, branch, changedFiles, allowAutomationId, foundationalInfrastructure = false } = {}) {
  const normalizedScope = String(scope || '').toUpperCase();
  if (![PLATFORM_SCOPE, AUTOMATION_SCOPE].includes(normalizedScope)) {
    throw new Error(`Scope must be ${PLATFORM_SCOPE} or ${AUTOMATION_SCOPE}.`);
  }
  if (normalizedScope === AUTOMATION_SCOPE && !/^aut_[a-f0-9]{16}$/.test(String(automationId || ''))) {
    throw new Error('Automation scope requires a valid automation_id.');
  }
  if (!branchAllowed(normalizedScope, branch, automationId, allowAutomationId)) {
    throw new Error(`Branch "${branch}" is not allowed for ${normalizedScope}${automationId ? ` ${automationId}` : ''}.`);
  }

  const manifest = normalizedScope === AUTOMATION_SCOPE ? registry.findByAutomationId(automationId) : null;
  if (normalizedScope === AUTOMATION_SCOPE && !manifest) throw new Error(`No manifest found for ${automationId}.`);

  const normalizedFiles = (changedFiles || []).map((file) => assertSafeRelativePath(file));
  const automationManifests = normalizedScope === PLATFORM_SCOPE && !foundationalInfrastructure ? registry.discoverAutomations() : [];
  const violations = normalizedFiles.filter((file) => {
    if (normalizedScope === AUTOMATION_SCOPE) return !fileAllowedForAutomation(file, manifest);
    const target = automationManifests.find((candidate) => fileAllowedForAutomation(file, candidate));
    if (!allowAutomationId && target) return true;
    if (allowAutomationId && target) {
      return !target || target.automation_id !== allowAutomationId;
    }
    return false;
  });
  if (violations.length) {
    throw new Error(`Workspace scope violation: ${violations.join(', ')}`);
  }
  return { scope: normalizedScope, automationId: automationId || null, branch, changedFiles: normalizedFiles, foundationalInfrastructure: Boolean(foundationalInfrastructure) };
}

module.exports = {
  PLATFORM_SCOPE,
  AUTOMATION_SCOPE,
  normalizePath,
  assertSafeRelativePath,
  branchAllowed,
  manifestAllowedPaths,
  fileAllowedForAutomation,
  validateWorkspaceScope,
};
