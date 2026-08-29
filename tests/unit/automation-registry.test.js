const fs = require('fs');
const path = require('path');
const registry = require('../../src/core/automation-registry');
const { validateManifest } = require('../../scripts/validate-automations');

describe('standard automation registry and manifests', () => {
  test('discovers the Phase 3 manifests and finds them by permanent identity', () => {
    const manifests = registry.discoverAutomations();
    expect(manifests.length).toBe(12);
    for (const manifest of manifests) {
      expect(registry.findByAutomationId(manifest.automation_id)).toMatchObject({ automation_id: manifest.automation_id });
    }
  });

  test('legacy integration keys and slugs resolve through compatibility aliases', () => {
    const byKey = registry.findByLegacyAlias('int_8b6e3d1f74a9c502');
    expect(byKey).toHaveLength(1);
    expect(byKey[0].automation_id).toBe('aut_13a032daadd81f2e');
    expect(registry.findByLegacyAlias('stock-sync')[0].automation_id).toBe('aut_30aaad4b8405bb7d');
  });

  test('all manifests use existing permanent identity files and do not contain secret values', () => {
    for (const manifest of registry.discoverAutomations()) {
      expect(validateManifest(manifest)).toEqual([]);
      expect(fs.existsSync(path.resolve(process.cwd(), manifest.runtime.entrypoint))).toBe(true);
    }
  });

  test('malformed schema, duplicate identity, missing entrypoint, and embedded secret values fail validation', () => {
    const malformed = {
      manifest_schema: 99,
      automation_id: 'aut_not-valid',
      slug: 'bad',
      name: 'Bad',
      version: '1.0.0',
      runtime: { type: 'manual', language: 'javascript', entrypoint: 'missing.js' },
      connections: {},
      config: {},
      ui: {},
      observability: {},
      tests: {},
      compatibility: { legacy: { slug: 'bad', integration_key: 'int_bad', code_folder: 'missing' } },
      secret_value: 'must-not-be-here',
    };
    const errors = validateManifest(malformed).join('\n');
    expect(errors).toMatch(/manifest_schema/);
    expect(errors).toMatch(/automation_id/);
    expect(errors).toMatch(/runtime.entrypoint/);
    expect(errors).toMatch(/secret value/);
  });

  test('legacy source folders and worker adapters remain referenced without moving runtime code', () => {
    const priorityOrder = registry.findByAutomationId('aut_ea71be6b4ff0780f');
    expect(priorityOrder.compatibility.legacy.code_folder).toBe('src/integrations/tuf1/priority-quote-whatsapp');
    expect(priorityOrder.connections.worker_adapter.package).toBe('integrations/priority-order-itc');
  });
});
