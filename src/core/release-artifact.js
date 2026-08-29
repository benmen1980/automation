const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_PATH_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(^|\/)(?:secrets?|credentials?)(?:\/|$)/i,
  /(?:\.pem|\.key|\.p12|\.pfx|\.secret)$/i,
];

function isSafeReleasePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('..')) return false;
  if (normalized === 'dist/release-manifest.json') return false;
  if (/(^|\/)(?:node_modules|\.git|local-data|logs)(?:\/|$)/.test(normalized)) return false;
  return !SECRET_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function createManifest({ root, commitSha, filePaths }) {
  const files = [...new Set(filePaths.map((filePath) => filePath.replace(/\\/g, '/').replace(/^\.\//, '')))]
    .filter(isSafeReleasePath)
    .filter((filePath) => fs.existsSync(path.join(root, filePath)))
    .sort()
    .map((filePath) => ({ path: filePath, sha256: hashFile(path.join(root, filePath)) }));

  const artifactDigest = crypto.createHash('sha256')
    .update(files.map((file) => `${file.path}\0${file.sha256}\n`).join(''))
    .digest('hex');

  return {
    schemaVersion: 1,
    commitSha,
    artifactDigest,
    files,
  };
}

function verifyManifest({ root, manifest, expectedDigest }) {
  if (!manifest || manifest.schemaVersion !== 1 || !manifest.commitSha || !manifest.artifactDigest) {
    throw new Error('Invalid release manifest');
  }

  const rebuilt = createManifest({
    root,
    commitSha: manifest.commitSha,
    filePaths: manifest.files.map((file) => file.path),
  });

  if (expectedDigest && expectedDigest !== manifest.artifactDigest) {
    throw new Error(`Artifact digest mismatch: expected ${expectedDigest}, got ${manifest.artifactDigest}`);
  }
  if (rebuilt.artifactDigest !== manifest.artifactDigest) {
    throw new Error(`Release contents do not match artifact digest ${manifest.artifactDigest}`);
  }
  for (const file of manifest.files) {
    const actual = rebuilt.files.find((candidate) => candidate.path === file.path);
    if (!actual || actual.sha256 !== file.sha256) {
      throw new Error(`Release file does not match manifest: ${file.path}`);
    }
  }
  return true;
}

function verifyPromotionManifests(manifests, expectedDigest) {
  if (!Array.isArray(manifests) || manifests.length === 0) {
    throw new Error('At least one release manifest is required');
  }
  const digests = new Set(manifests.map((manifest) => manifest.artifactDigest));
  const commits = new Set(manifests.map((manifest) => manifest.commitSha));
  if (digests.size !== 1 || commits.size !== 1) {
    throw new Error('Release promotion requires the same commit and artifact digest in every environment');
  }
  const digest = manifests[0].artifactDigest;
  if (expectedDigest && expectedDigest !== digest) {
    throw new Error(`Rollback digest mismatch: expected ${expectedDigest}, got ${digest}`);
  }
  return { commitSha: manifests[0].commitSha, artifactDigest: digest };
}

module.exports = { createManifest, isSafeReleasePath, verifyManifest, verifyPromotionManifests };
