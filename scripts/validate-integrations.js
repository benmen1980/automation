#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const integrationLoader = require('../src/core/integration-loader');

const root = path.resolve(process.cwd(), 'src/integrations');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name === 'integration.js') {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(root).sort();
const failures = [];

for (const file of files) {
  try {
    const definition = integrationLoader.loadDefinitionFromPath(file);
    integrationLoader.validateIntegrationContract(definition, { strict: true });
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

console.log(`Validated ${files.length} integration contract(s).`);
