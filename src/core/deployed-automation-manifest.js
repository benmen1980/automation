const crypto = require('crypto');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

function prefix(automationId) {
  if (!/^aut_[a-f0-9]{16}$/.test(automationId)) throw new Error('Invalid automation ID');
  return `deployed-automations/${automationId}`;
}

function assertNewer(current, candidate) {
  if (!Number.isSafeInteger(candidate.order) || candidate.order <= 0 || !candidate.deploymentId) {
    throw new Error('Missing deployment identity or order');
  }
  if (!current) return;
  if (current.deploymentId === candidate.deploymentId) {
    if (JSON.stringify(current) !== JSON.stringify(candidate)) throw new Error('Deployment identity reused with different contents');
    return;
  }
  if (!Number.isSafeInteger(current.order) || current.order >= candidate.order) {
    throw new Error('Stale deployment cannot replace the current manifest');
  }
}

function createStore({ bucket, client = new S3Client({}) }) {
  if (!bucket) throw new Error('AUTOMATION_MANIFEST_BUCKET is required');

  async function get(key) {
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { body: await result.Body.transformToString(), etag: result.ETag };
    } catch (error) {
      if (error.name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async function current(automationId) {
    const result = await get(`${prefix(automationId)}/current.json`);
    return result ? { pointer: JSON.parse(result.body), etag: result.etag } : null;
  }

  async function read(automationId) {
    const latest = await current(automationId);
    if (!latest) throw new Error(`No successful deployment manifest for ${automationId}`);
    const { manifestKey, manifestSha256 } = latest.pointer;
    if (!manifestKey?.startsWith(`${prefix(automationId)}/releases/`)) throw new Error('Invalid deployment manifest key');
    const result = await get(manifestKey);
    if (!result || digest(result.body) !== manifestSha256) throw new Error('Deployment manifest checksum mismatch');
    const manifest = JSON.parse(result.body);
    if (manifest.automation_id !== automationId || !manifest.version) throw new Error('Invalid deployed automation manifest');
    return manifest;
  }

  async function publish({ automationId, body, deploymentId, order, commitSha, codeSha256, verifyDeployment }) {
    const manifest = JSON.parse(body);
    if (manifest.automation_id !== automationId || !manifest.version) throw new Error('Invalid automation manifest');
    const manifestKey = `${prefix(automationId)}/releases/${digest(deploymentId)}/automation.json`;
    const pointer = { deploymentId, order, commitSha, codeSha256, manifestKey, manifestSha256: digest(body) };
    let latest = await current(automationId);
    assertNewer(latest?.pointer, pointer);
    await verifyDeployment();
    // Preserve the original file bytes. The pointer carries deployment metadata only.
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: manifestKey, Body: body, ContentType: 'application/json', IfNoneMatch: '*' }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 412) throw error;
      const existing = await get(manifestKey);
      if (existing?.body !== body) throw new Error('Deployment manifest is immutable');
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assertNewer(latest?.pointer, pointer);
      await verifyDeployment();
      if (latest?.pointer.deploymentId === deploymentId) return pointer;
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket, Key: `${prefix(automationId)}/current.json`,
          Body: JSON.stringify(pointer), ContentType: 'application/json', CacheControl: 'no-store',
          ...(latest ? { IfMatch: latest.etag } : { IfNoneMatch: '*' }),
        }));
        return pointer;
      } catch (error) {
        if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
        latest = await current(automationId);
      }
    }
    throw new Error('Deployment manifest publication conflicted; retry synchronization');
  }

  return { current, read, publish };
}

let apiStore;
async function displayedManifest(localManifest) {
  if (!process.env.AUTOMATION_MANIFEST_BUCKET || !localManifest?.connections?.worker_adapter?.package) return localManifest;
  const enabledIds = process.env.AUTOMATION_MANIFEST_AUTOMATION_IDS?.split(',').map((id) => id.trim()).filter(Boolean);
  if (enabledIds?.length && !enabledIds.includes(localManifest.automation_id)) return localManifest;
  apiStore ||= createStore({ bucket: process.env.AUTOMATION_MANIFEST_BUCKET });
  try {
    return await apiStore.read(localManifest.automation_id);
  } catch (error) {
    error.statusCode = 503;
    throw error;
  }
}

module.exports = { createStore, displayedManifest, assertNewer, digest };
