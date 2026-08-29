const fs = require('fs');
const os = require('os');
const path = require('path');
const { createManifest, verifyManifest, verifyPromotionManifests } = require('../../src/core/release-artifact');

describe('release artifact manifest', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'secrets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'app.js'), 'stable code\n');
    fs.writeFileSync(path.join(root, '.env'), 'DO_NOT_INCLUDE=secret\n');
    fs.writeFileSync(path.join(root, 'secrets', 'token.txt'), 'secret\n');
  });

  test('produces the same digest for the same commit and contents', () => {
    const files = ['src/app.js', '.env', 'secrets/token.txt'];
    const first = createManifest({ root, commitSha: 'abc123', filePaths: files });
    const second = createManifest({ root, commitSha: 'abc123', filePaths: files });
    expect(first).toEqual(second);
    expect(first.files).toEqual([{ path: 'src/app.js', sha256: expect.any(String) }]);
    expect(JSON.stringify(first)).not.toContain('secret');
  });

  test('detects changed release contents and supports exact digest selection', () => {
    const manifest = createManifest({ root, commitSha: 'abc123', filePaths: ['src/app.js'] });
    expect(verifyManifest({ root, manifest, expectedDigest: manifest.artifactDigest })).toBe(true);
    fs.writeFileSync(path.join(root, 'src', 'app.js'), 'changed code\n');
    expect(() => verifyManifest({ root, manifest })).toThrow(/contents do not match/);
    expect(() => verifyManifest({ root, manifest, expectedDigest: 'previous-known-good' })).toThrow(/Artifact digest mismatch/);
  });

  test('requires one commit and digest across promoted environments', () => {
    const manifest = createManifest({ root, commitSha: 'abc123', filePaths: ['src/app.js'] });
    expect(verifyPromotionManifests([manifest, { ...manifest }], manifest.artifactDigest)).toEqual({
      commitSha: 'abc123',
      artifactDigest: manifest.artifactDigest,
    });
    expect(() => verifyPromotionManifests([{ ...manifest, commitSha: 'different' }, manifest])).toThrow(/same commit/);
    expect(() => verifyPromotionManifests([manifest], 'old-known-good')).toThrow(/Rollback digest mismatch/);
  });
});
