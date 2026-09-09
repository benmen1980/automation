#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { discoverAutomations } = require('../src/core/automation-registry');
const { createStore, assertNewer, digest } = require('../src/core/deployed-automation-manifest');

function prepare(name) {
  const matches = discoverAutomations().filter((manifest) => manifest.connections?.worker_adapter?.package === `integrations/${name}`);
  if (matches.length !== 1) throw new Error('Expected exactly one automation manifest for the worker package');
  const manifest = matches[0];
  const body = fs.readFileSync(manifest.__file, 'utf8');
  const release = JSON.parse(fs.readFileSync(`dist/release-manifest-${name}.json`, 'utf8'));
  const relative = path.relative(process.cwd(), manifest.__file).replace(/\\/g, '/');
  if (!manifest.version || release.files.find((file) => file.path === relative)?.sha256 !== digest(body)) {
    throw new Error('Automation manifest does not match the verified release');
  }
  fs.writeFileSync(`dist/lambda-${name}/automation.json`, body);
}

function aws(args) {
  return JSON.parse(execFileSync('aws', [...args, '--output', 'json'], { encoding: 'utf8' }) || '{}');
}

async function deploy({ env = process.env, runAws = aws, store, syncOnly = false, readZipFile = (zip, file) => execFileSync('unzip', ['-p', zip, file], { encoding: 'utf8' }) } = {}) {
  if (env.CODEBUILD_BUILD_SUCCEEDING !== '1') throw new Error('Build did not succeed; deployment blocked');
  const name = env.INTEGRATION_NAME;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name || '')) throw new Error('Invalid integration name');
  const deploymentId = env.CODEBUILD_BUILD_ID;
  const order = Number(env.CODEBUILD_START_TIME);
  assertNewer(null, { deploymentId, order });
  store ||= createStore({ bucket: env.AUTOMATION_MANIFEST_BUCKET });
  const zip = `dist/${name}.zip`;
  // Read from the actual ZIP, never from the API checkout or a mutable source file.
  const body = readZipFile(zip, 'automation.json');
  const manifest = JSON.parse(body);
  const release = JSON.parse(readZipFile(zip, 'release-manifest.json'));
  if (!release.commitSha || release.commitSha !== env.CODEBUILD_RESOLVED_SOURCE_VERSION ||
      manifest.connections?.worker_adapter?.package !== `integrations/${name}`) throw new Error('Deployment artifact identity mismatch');
  const codeSha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('base64');
  const current = await store.current(manifest.automation_id);
  // An old build retry must not replace the Lambda either.
  if (current?.pointer.deploymentId === deploymentId) {
    if (current.pointer.order !== order || current.pointer.codeSha256 !== codeSha256 ||
        current.pointer.manifestSha256 !== digest(body) || current.pointer.commitSha !== release.commitSha) {
      throw new Error('Deployment identity reused with different contents');
    }
  } else {
    assertNewer(current?.pointer, { deploymentId, order });
  }
  const before = runAws(['lambda', 'get-function-configuration', '--function-name', name]);
  if (!syncOnly) runAws(['lambda', 'update-function-code', '--function-name', name, '--zip-file', `fileb://${zip}`, '--revision-id', before.RevisionId]);
  if (!syncOnly) runAws(['lambda', 'wait', 'function-updated-v2', '--function-name', name]);
  // Capture the completed revision, not the in-progress update response.
  let deployedRevision = syncOnly ? before.RevisionId : null;
  const verifyDeployment = async () => {
    const actual = runAws(['lambda', 'get-function-configuration', '--function-name', name]);
    if (actual.LastUpdateStatus !== 'Successful' || actual.State !== 'Active' ||
        actual.CodeSha256 !== codeSha256 || (deployedRevision && actual.RevisionId !== deployedRevision)) {
      throw new Error('Lambda update is not successful or no longer matches this deployment');
    }
    deployedRevision = actual.RevisionId;
  };
  await verifyDeployment();
  return store.publish({ automationId: manifest.automation_id, body, deploymentId, order,
    commitSha: release.commitSha, codeSha256, verifyDeployment });
}

if (require.main === module) {
  Promise.resolve().then(() => {
    if (process.argv[2] === 'prepare') return prepare(process.env.INTEGRATION_NAME);
    if (process.argv[2] === 'deploy') return deploy();
    if (process.argv[2] === 'sync') return deploy({ syncOnly: true });
    throw new Error('Usage: deploy-lambda-integration.js <prepare|deploy|sync>');
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { prepare, deploy };
