# Release artifact contract

Every deployable build must contain a `release-manifest.json` with:

- `commitSha`: the source commit used to build the artifact;
- `artifactDigest`: a deterministic SHA-256 digest of the release files;
- per-file SHA-256 entries for verification.

The API and Lambda buildspecs create and verify this manifest before producing
their existing CodePipeline artifacts. Promotion tooling must verify that the
DEV, STAGING, and PROD manifests contain the same `commitSha` and
`artifactDigest`:

```text
npm run release:verify-promotion -- --expected-digest <known-good-digest> dev.json staging.json prod.json
```

The same command with a previously recorded digest is the rollback selection
check. It does not deploy or alter AWS resources. Secret values and secret
paths are excluded from the manifest.
