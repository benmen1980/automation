# AWS Deployment Plan

This describes the target production architecture per the [product architecture spec](../product/product-architecture-spec.md) sections 12-13
and the exact code change required at each swap point. No AWS resources have been
created — this is the design + migration checklist, to be executed when ready to
deploy.

## Architecture

```text
Dashboard User ─────▶ Elastic Beanstalk (Node.js app) ─────▶ RDS PostgreSQL
Webhook Request ────▶ Elastic Beanstalk ─────▶ SQS Queue ─────▶ Worker ─────▶ Handler ─────▶ External API
EventBridge Scheduler ─────▶ SQS Queue ─────▶ Worker ─────▶ Handler ─────▶ External API
Secrets Manager ◀───────────── App / Worker
CloudWatch Logs ◀───────────── AWS services + app
Cognito ◀───────────── App (login)
```

## Services and their role

| Service | Purpose |
|---|---|
| Elastic Beanstalk | Hosts the Express app and webhook endpoints; environments `testing` / `staging` / `production` |
| RDS PostgreSQL | Replaces local SQLite — users, integrations, credential references, settings, executions, logs |
| SQS | Decouples webhook/schedule triggers from execution so requests don't time out; DLQ for failed jobs |
| EventBridge Scheduler | Triggers scheduled integrations by cron/rate, replacing the in-process node-cron |
| Secrets Manager | Stores credential secret values (never in the DB or code) |
| Cognito | Production auth — email/password, password reset, optional MFA, JWT |
| CloudWatch Logs | Infra + technical logs. Application/user-facing logs stay in the DB (per [product architecture spec](../product/product-architecture-spec.md) 12.7) |
| IAM Roles | Scoped to only the SQS queues, Secrets Manager paths, CloudWatch log groups, and RDS access this app needs — no hardcoded AWS keys |

## Code swap points

The app was built with these as explicit abstraction boundaries, selected by env
var, specifically so the production swap doesn't touch business logic:

**Database** — implemented as a separate `prisma/schema.postgres.prisma` file
(provider `postgresql`) rather than editing `schema.prisma` in place, so local
SQLite dev keeps working. Selected via `PRISMA_SCHEMA=prisma/schema.postgres.prisma`
(read by `scripts/prisma-postinstall.js`) plus the `db:generate:aws` /
`db:push:aws` npm scripts. The actual EB environment runs `prisma db push`
(via `.platform/hooks/predeploy/01_db_push.sh`) on every deploy, not
`prisma migrate deploy` — there is no committed migration history for
Postgres yet (no live Postgres was reachable to generate one against). Once
the schema stabilizes and there's a real Postgres dev workflow, switch to
`prisma migrate dev` → committed `migrations/` → `db:deploy` in CI/CD, per
the original plan. See the [AWS testing environment runbook](./aws-testing-environment-runbook.md) for the exact, run-this-yourself
command sequence for the `testing` environment.

**Secrets** — `src/core/secrets.js`. Set `SECRETS_MODE=aws`. The AWS backend is
already implemented (`getAwsBackend()`), lazily requiring
`@aws-sdk/client-secrets-manager` so local dev never needs that package — run
`npm install @aws-sdk/client-secrets-manager` on the deploy target first. Secret
names are written as `automation/<integrationId>/<key>`; scope the IAM policy to
`automation/*`.

**Queue** — `src/core/queue.js`. Set `QUEUE_MODE=sqs`. The current implementation
deliberately throws on this mode (`enqueueExecution`) — it is not yet wired to a
real queue. Before flipping this in production:
1. Add an SQS publish call in `enqueueExecution` (job body = the execution id +
   inputs `execution-runner.runExecution` needs).
2. Build a worker process (a second EB environment or a separate Lambda) that long-
   polls the queue and calls `execution-runner.runExecution` with the message body.
3. Configure a dead-letter queue for jobs that fail repeatedly.

**Scheduler** — `src/core/scheduler.js`. Set `SCHEDULER_MODE=aws`; `start()`
already no-ops in this mode rather than starting node-cron (a long-running
in-process timer doesn't survive EB autoscaling/restarts). Before flipping this:
1. Add an internal endpoint, e.g. `POST /internal/run-scheduled/:integrationId`,
   guarded by an IAM/role check (not a user JWT) — per [product architecture spec](../product/product-architecture-spec.md) 12.4.
2. For each active `ScheduleSettings` row, create an EventBridge Scheduler rule
   with the matching cron expression/timezone that invokes that endpoint (directly,
   or via SQS to reuse the same worker as webhooks).
3. Keep `lastRunAt`/`nextRunAt` updates in `schedule-runner.js` as-is — they're
   already mode-agnostic.

**Auth** — `src/core/auth.js`. `AUTH_MODE=mock` issues real JWTs against bcrypt
password hashes in the DB ("mock" means "no Cognito," not "fake security"). For
production, replace `login()` with Cognito token verification, keeping
`req.user = { id, slug, email, role }` the same shape so every downstream
permission check (`src/core/permissions.js`, every route) needs no changes.

**Webhook host** — `WebhookSettings.webhookUrl` is currently stored as a relative
path; once the EB environment domain is known, either store the full URL or have
the dashboard prefix it with the configured public base URL.

## Branch → environment mapping

```text
develop  →  testing
staging  →  staging
main     →  production
```

## CI/CD (GitHub Actions or CodePipeline)

```text
1. install dependencies (npm ci, both root and frontend/dashboard)
2. npm run db:generate
3. npm test                      — must pass; do not deploy on failure
4. npm run build (frontend)
5. deploy to the environment mapped from the branch
```

Do not deploy to `production` if tests fail or if the migration step
(`prisma migrate deploy`) reports drift that wasn't reviewed.

## Rollout checklist

- [ ] RDS PostgreSQL instance provisioned, `DATABASE_URL` set, schema applied
      via `db:push:aws` (see [AWS testing environment runbook](./aws-testing-environment-runbook.md)) — move to `db:deploy` once real
      migrations exist
- [ ] Secrets Manager paths created, `SECRETS_MODE=aws`,
      `@aws-sdk/client-secrets-manager` installed
- [ ] SQS queue + DLQ provisioned, worker deployed, `QUEUE_MODE=sqs`
- [ ] EventBridge Scheduler rules created per active `ScheduleSettings` row,
      internal run endpoint added and IAM-guarded, `SCHEDULER_MODE=aws`
- [ ] Cognito user pool created, users migrated, `login()` swapped
- [ ] IAM role scoped to only the resources above (no hardcoded AWS keys anywhere)
- [ ] CloudWatch log groups configured for EB + worker
- [ ] CI/CD pipeline wired with the test gate above, branch→environment mapping
      configured
