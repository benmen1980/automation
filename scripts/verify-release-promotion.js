#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { verifyPromotionManifests } = require('../src/core/release-artifact');

const args = process.argv.slice(2);
const expectedDigestIndex = args.indexOf('--expected-digest');
const expectedDigest = expectedDigestIndex === -1 ? undefined : args[expectedDigestIndex + 1];
const manifestPaths = args.filter((arg, index) => arg !== '--expected-digest' && index !== expectedDigestIndex + 1);

if (manifestPaths.length === 0) {
  process.stderr.write('Usage: node scripts/verify-release-promotion.js [--expected-digest digest] <manifest> [manifest ...]\n');
  process.exit(2);
}

const manifests = manifestPaths.map((manifestPath) => JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')));
const result = verifyPromotionManifests(manifests, expectedDigest);
process.stdout.write(`${JSON.stringify(result)}\n`);
