# AWS Architecture

The repository is one monorepo. Services deploy independently based on changed paths.

## Services

- API/dashboard: Elastic Beanstalk for now.
- Normal integrations: AWS Lambda.
- Heavy or long-running integrations: ECS/Fargate.
- Queueing: one SQS queue and one DLQ per integration.
- Scheduling: EventBridge schedules enqueue jobs or trigger workers.
- Secrets: AWS Secrets Manager or SSM Parameter Store.
- Logs: CloudWatch log group per service and per integration.

## Deployment Triggers

- `apps/api/**`, API runtime files under `src/**` except `src/integrations/**`, `prisma/**`, `frontend/dashboard/**`: deploy API/dashboard.
- `src/integrations/**`: legacy local integrations only; do not include this path in the API production pipeline while integrations are being migrated to independent workers.
- `integrations/gmail-priority/**`: deploy Gmail/Priority worker.
- `integrations/shopify-priority/**`: deploy Shopify/Priority worker.
- `integrations/salesforce-priority/**`: deploy Salesforce/Priority worker.
- `packages/shared/**`: deploy all dependent workers and the API when shared runtime behavior changes.

Path filters are documented in `infra/aws/scripts/create-pipeline-api.sh` and `infra/aws/scripts/create-pipeline-integration.sh`. The scripts leave account-specific IAM role ARNs and connection ARNs explicit so secrets and permissions are not invented or committed.

## Job Lifecycle

Jobs should move through:

```text
queued -> running -> success
queued -> running -> failed
```

Worker failures must be recorded against the job and surfaced in CloudWatch/API status. A failed integration must not crash the API/dashboard process.

## Scripts

- `infra/aws/scripts/bootstrap.sh`
- `infra/aws/scripts/create-eb-api.sh`
- `infra/aws/scripts/create-sqs-for-integration.sh <integration-name>`
- `infra/aws/scripts/create-lambda-integration.sh <integration-name>`
- `infra/aws/scripts/create-fargate-integration.sh <integration-name>`
- `infra/aws/scripts/create-codeconnection.sh`
- `infra/aws/scripts/create-pipeline-api.sh`
- `infra/aws/scripts/create-pipeline-integration.sh <integration-name>`

## Buildspecs

- `buildspec-api-eb.yml`: tests/builds API and dashboard for Elastic Beanstalk.
- `buildspec-lambda-integration.yml`: tests and packages one Lambda integration.
- `buildspec-fargate-integration.yml`: tests and builds a container image for heavy integrations.

## Current Migration Note

The current API entrypoint remains at `src/server.js` to avoid breaking the local dashboard while the monorepo is introduced. New integrations should be built under `integrations/<name>` and invoked through queues/runners instead of being executed in-process by the API.
