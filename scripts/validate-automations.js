#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const registry = require('../src/core/automation-registry');

const SUPPORTED_SCHEMA = 1;
const AUTOMATION_ID = /^aut_[a-f0-9]{16}$/;
const RUNTIME_TYPES = new Set(['scheduled', 'webhook', 'web-service', 'manual', 'event-driven', 'worker']);
const ROOT = path.resolve(process.cwd());

function requiredString(value, label, errors) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${label} must be a non-empty string.`);
}

function resolveRepoFile(value, label, errors) {
  requiredString(value, label, errors);
  if (typeof value !== 'string' || !value.trim()) return;
  const resolved = path.resolve(ROOT, value);
  if (!fs.existsSync(resolved)) errors.push(`${label} does not exist: ${value}`);
}

function scanForEmbeddedSecrets(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForEmbeddedSecrets(item, `${location}[${index}]`, errors));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(^|_)(value|secret_value|token_value|password_value|api_key_value)$/i.test(key)) {
      errors.push(`${location}.${key} must not contain a secret value.`);
    }
    scanForEmbeddedSecrets(child, `${location}.${key}`, errors);
  }
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest.manifest_schema !== SUPPORTED_SCHEMA) errors.push(`manifest_schema must be ${SUPPORTED_SCHEMA}.`);
  requiredString(manifest.automation_id, 'automation_id', errors);
  if (manifest.automation_id && !AUTOMATION_ID.test(manifest.automation_id)) errors.push('automation_id must use aut_<16 lowercase hexadecimal characters>.');
  requiredString(manifest.slug, 'slug', errors);
  requiredString(manifest.name, 'name', errors);
  requiredString(manifest.version, 'version', errors);
  if (!manifest.runtime || typeof manifest.runtime !== 'object') {
    errors.push('runtime metadata is required.');
  } else {
    if (!RUNTIME_TYPES.has(manifest.runtime.type)) errors.push(`runtime.type must be one of: ${[...RUNTIME_TYPES].join(', ')}.`);
    requiredString(manifest.runtime.language, 'runtime.language', errors);
    resolveRepoFile(manifest.runtime.entrypoint, 'runtime.entrypoint', errors);
    if (manifest.runtime.definition) resolveRepoFile(manifest.runtime.definition, 'runtime.definition', errors);
  }
  if (!manifest.connections || typeof manifest.connections !== 'object') errors.push('connections metadata is required.');
  if (!manifest.config || typeof manifest.config !== 'object') errors.push('config metadata is required.');
  if (!manifest.ui || typeof manifest.ui !== 'object') errors.push('ui metadata is required.');
  else if (manifest.ui.path) resolveRepoFile(manifest.ui.path, 'ui.path', errors);
  if (!manifest.observability || typeof manifest.observability !== 'object') errors.push('observability metadata is required.');
  if (!manifest.tests || typeof manifest.tests !== 'object') errors.push('tests metadata is required.');
  if (Array.isArray(manifest.tests?.references)) {
    manifest.tests.references.forEach((reference, index) => resolveRepoFile(reference, `tests.references[${index}]`, errors));
  }
  const workerPackage = manifest.connections?.worker_adapter?.package;
  if (workerPackage) {
    const resolvedWorkerPackage = path.resolve(ROOT, workerPackage);
    if (!fs.existsSync(resolvedWorkerPackage)) errors.push(`connections.worker_adapter.package does not exist: ${workerPackage}`);
  }
  const legacy = manifest.compatibility?.legacy;
  if (!legacy || typeof legacy !== 'object') errors.push('compatibility.legacy metadata is required.');
  else {
    requiredString(legacy.integration_key, 'compatibility.legacy.integration_key', errors);
    requiredString(legacy.slug, 'compatibility.legacy.slug', errors);
    resolveRepoFile(legacy.code_folder, 'compatibility.legacy.code_folder', errors);
  }
  scanForEmbeddedSecrets(manifest, 'manifest', errors);
  return errors;
}

async function validateAgainstDatabase(manifests) {
  const prisma = new PrismaClient();
  try {
    const failures = [];
    for (const manifest of manifests) {
      const integration = await prisma.integration.findUnique({
        where: { automationId: manifest.automation_id },
        select: { id: true, automationId: true, slug: true, codeFolder: true },
      });
      if (!integration) {
        failures.push(`${manifest.__file}: automation_id does not match an Integration row.`);
        continue;
      }
      const legacy = manifest.compatibility.legacy;
      if (integration.slug !== legacy.slug) failures.push(`${manifest.__file}: slug does not match Integration.slug.`);
      if (integration.codeFolder !== legacy.code_folder) failures.push(`${manifest.__file}: code_folder does not match Integration.codeFolder.`);
    }
    return failures;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const manifests = registry.discoverAutomations();
  const failures = [];
  const ids = new Map();
  for (const manifest of manifests) {
    const errors = validateManifest(manifest);
    for (const error of errors) failures.push(`${manifest.__file}: ${error}`);
    if (ids.has(manifest.automation_id)) failures.push(`${manifest.__file}: duplicate automation_id also used by ${ids.get(manifest.automation_id)}.`);
    ids.set(manifest.automation_id, manifest.__file);
  }
  if (manifests.length === 0) failures.push('No automation.json manifests were discovered.');
  try {
    failures.push(...(await validateAgainstDatabase(manifests)));
  } catch (error) {
    failures.push(`Database identity validation failed: ${error.message}`);
  }
  if (failures.length) {
    console.error(`Automation manifest validation failed with ${failures.length} error(s):`);
    failures.forEach((failure) => console.error(`\n${path.relative(ROOT, failure)}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${manifests.length} automation manifest(s), unique IDs, runtime entrypoints, references, secret safety, and database identities.`);
}

if (require.main === module) main();

module.exports = { validateManifest, validateAgainstDatabase, main };
