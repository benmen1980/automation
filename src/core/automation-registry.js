const fs = require('fs');
const path = require('path');

const AUTOMATIONS_ROOT = path.resolve(process.cwd(), 'automations');
const MANIFEST_FILE = 'automation.json';

function packageDirectories(root = AUTOMATIONS_ROOT) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, MANIFEST_FILE)))
    .sort();
}

function loadManifestFromDirectory(directory) {
  const file = path.join(directory, MANIFEST_FILE);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...manifest, __file: file, __directory: directory };
}

function discoverAutomations(root = AUTOMATIONS_ROOT) {
  return packageDirectories(root).map(loadManifestFromDirectory);
}

function findByAutomationId(automationId, root = AUTOMATIONS_ROOT) {
  return discoverAutomations(root).find((manifest) => manifest.automation_id === automationId) || null;
}

function findByLegacyAlias(alias, root = AUTOMATIONS_ROOT) {
  return discoverAutomations(root).filter((manifest) => {
    const legacy = manifest.compatibility?.legacy || {};
    return [legacy.integration_id, legacy.integration_key, legacy.slug].filter(Boolean).includes(alias);
  });
}

function publicManifest(manifest) {
  const { __file, __directory, ...publicValue } = manifest;
  return {
    ...publicValue,
    ui: {
      mode: 'generic',
      fallback: true,
      modules: [],
      ...(publicValue.ui || {}),
    },
    observability: {
      mode: 'generic',
      eventSchema: 'automation.log',
      metrics: [],
      alerts: [],
      ...(publicValue.observability || {}),
    },
  };
}

module.exports = {
  AUTOMATIONS_ROOT,
  MANIFEST_FILE,
  packageDirectories,
  discoverAutomations,
  findByAutomationId,
  findByLegacyAlias,
  publicManifest,
};
