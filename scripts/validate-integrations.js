#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const integrationLoader = require('../src/core/integration-loader');

const legacyRoot = path.resolve(process.cwd(), 'src/integrations');
const workspaceRoot = path.resolve(process.cwd(), 'integrations');

function walk(dir, fileName) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath, fileName));
    } else if (entry.isFile() && entry.name === fileName) {
      files.push(fullPath);
    }
  }
  return files;
}

(async () => {
  const legacyFiles = walk(legacyRoot, 'integration.js').sort();
  const manifestFiles = walk(workspaceRoot, 'manifest.js').sort();
  const failures = [];

  for (const file of legacyFiles) {
    try {
      const definition = integrationLoader.loadDefinitionFromPath(file);
      integrationLoader.validateIntegrationContract(definition, { strict: true });
    } catch (err) {
      failures.push({ file, message: err.message });
    }
  }

  for (const file of manifestFiles) {
    try {
      const module = await import(pathToFileURL(file).href);
      integrationLoader.validateWorkerManifestContract(module.default || module, { strict: true });
    } catch (err) {
      failures.push({ file, message: err.message });
    }
  }

  if (failures.length > 0) {
    console.error(`Integration validation failed for ${failures.length} file(s):`);
    for (const failure of failures) {
      console.error(`\n${path.relative(process.cwd(), failure.file)}`);
      console.error(failure.message);
    }
    process.exit(1);
  }

  console.log(`Validated ${legacyFiles.length} legacy integration contract(s) and ${manifestFiles.length} worker manifest(s).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
