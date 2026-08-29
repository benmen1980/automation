#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createManifest, verifyManifest } = require('../src/core/release-artifact');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const command = args[0] || 'build';

function option(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function trackedFiles() {
  try {
    const output = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (fs.existsSync(path.join(root, '.git'))) throw error;
    const files = [];
    function visit(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'local-data', 'logs'].includes(entry.name)) visit(fullPath);
        } else {
          files.push(relativePath);
        }
      }
    }
    visit(root);
    return files;
  }
}

function commitSha() {
  return process.env.CODEBUILD_RESOLVED_SOURCE_VERSION
    || process.env.GIT_COMMIT_SHA
    || execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function build() {
  const output = option('--output', path.join('dist', 'release-manifest.json'));
  const manifest = createManifest({ root, commitSha: commitSha(), filePaths: trackedFiles() });
  const outputPath = path.resolve(root, output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${manifest.artifactDigest}\n`);
}

function verify() {
  const manifestPath = path.resolve(root, option('--manifest', path.join('dist', 'release-manifest.json')));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  verifyManifest({ root, manifest, expectedDigest: option('--expected-digest') });
  process.stdout.write(`${manifest.artifactDigest}\n`);
}

if (command === 'build') build();
else if (command === 'verify') verify();
else {
  process.stderr.write('Usage: node scripts/release-artifact.js <build|verify> [--output path] [--manifest path] [--expected-digest digest]\n');
  process.exitCode = 2;
}
