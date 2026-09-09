# Deployed automation versions

The only automation version is `version` in the source `automation.json`.
The Lambda ZIP now includes an exact copy of that file. After a successful
Lambda update, the deployment copies those bytes from the ZIP to S3:

```text
deployed-automations/<automation_id>/releases/<deployment-id-sha256>/automation.json
deployed-automations/<automation_id>/current.json
```

`current.json` contains only deployment identity/order, commit, checksums and
the file key. It has no separate version number. The API reads the published
file on each request; API-local files and DB synchronization cannot override it.
The existing API/frontend `version` field is retained. No automation business
logic or database schema changes are required.

## One-time activation (per environment)

1. Choose an existing private S3 bucket in the environment's AWS region. It may
   be the artifact bucket, provided its lifecycle rules do not expire the
   `deployed-automations/` prefix. Never share this prefix between staging and
   production. Set `AUTOMATION_MANIFEST_BUCKET` to its name in the deployment
   environment. Do not enable it on the running API until step 4.
2. Grant the integration CodeBuild role `s3:GetObject` and `s3:PutObject` on
   `arn:aws:s3:::<bucket>/deployed-automations/<automation_id>/*`, and
   `s3:ListBucket` on the bucket with `s3:prefix` restricted to that prefix.
   The list permission makes missing keys return 404 rather than 403.
   Retain `lambda:UpdateFunctionCode` and add `lambda:GetFunctionConfiguration`
   and `lambda:GetFunction` on the worker's Lambda ARN (the waiter needs GetFunction).
   Grant the API's EB **instance role** read/list permissions on
   `deployed-automations/*`. For an SSE-KMS bucket, also grant the corresponding
   KMS decrypt permissions and the writer's GenerateDataKey permission.
3. Update each existing Lambda CodeBuild project to include
   `AUTOMATION_MANIFEST_BUCKET` and `concurrentBuildLimit: 1`, preserving its
   other environment values and configuration. Set its pipeline execution mode
   to `QUEUED`. Include the new shared script/module paths in its source trigger.
   `infra/aws/scripts/create-pipeline-integration.sh` generates these settings
   for new/recreated pipelines; retain existing custom settings when updating
   an existing pipeline. This setup must precede running the updated buildspec.
4. Deploy the intended release through the updated Lambda pipeline for every
   registered worker using `connections.worker_adapter.package`. Verify its
   published `automation.json` against the deployed ZIP. Then deploy the API
   with `AUTOMATION_MANIFEST_BUCKET` set to the same bucket. A worker with a
   missing/unreadable/corrupt published file produces HTTP 503, not an unverified
   local version; initialize all such workers before enabling API reads.
   If only some registered workers deploy independently in this environment,
   set `AUTOMATION_MANIFEST_AUTOMATION_IDS` on the API to their comma-separated
   automation IDs. Only these workers use S3; others retain their existing
   file-based behavior. Add an ID after its first verified publication.

Use a normal successful deployment to initialize the current version. Do not
upload the current checkout's file as a substitute for deployment verification.
API-native automations and local development continue to use their source file.
An empty bucket setting preserves local behavior; it must be set in AWS.

## Failure, ordering and retry

- A failed build cannot enter deployment. The publisher waits for Lambda's
  successful update and checks Active state, ZIP CodeSha256 and RevisionId.
  Failed updates never move the pointer.
- The deployment order is the original `CODEBUILD_START_TIME`, not a version
  comparison or the time of a retry. `CODEBUILD_BUILD_ID` identifies retries.
  A conditional S3 write (`IfMatch` / `IfNoneMatch`) prevents stale publishers
  from overwriting newer pointers, including concurrent publishers of identical
  manifests. The original file is immutable. Deploy through the single queued
  pipeline/project for each Lambda; do not run competing deployment projects.
- A successful Lambda update followed by failed S3 synchronization fails the
  build and leaves the last published pointer in place. Lambda and S3 are not
  one transaction. Treat this as a synchronization failure and retry promptly.
- To retry **only synchronization**, restore the exact original ZIP at
  `dist/<integration-name>.zip` and retain the original build's
  `CODEBUILD_BUILD_ID`, `CODEBUILD_START_TIME`, `CODEBUILD_RESOLVED_SOURCE_VERSION`,
  `INTEGRATION_NAME`, bucket and region. Set `CODEBUILD_BUILD_SUCCEEDING=1` only
  for that previously successful build phase, then run:

  ```sh
  node scripts/deploy-lambda-integration.js sync
  ```

  This does not update Lambda. It verifies that the running code still matches
  that ZIP, then attempts the same conditional publication. A late old retry
  is rejected. Alternatively, rerun the normal pipeline for a new deployment.
- An intentional rollback is a new queued deployment of the old source, with a
  new deployment identity/order; it may correctly display a lower version.

AWS references: [conditional S3 writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[Lambda update waiter](https://docs.aws.amazon.com/cli/latest/reference/lambda/wait/function-updated-v2.html).
