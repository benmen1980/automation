# User-Based Automation Platform

A Node.js automation platform where each user owns multiple **integrations**. Each
integration is a custom automation (webhook-triggered or scheduled) with its own
`integration.js` definition, `handler.js` business logic, credentials, executions,
and logs. The full product/architecture spec is in the [documentation suite](./docs/README.md) - this
file covers how to actually run the thing.

## Documentation Suite

- [Product architecture spec](./docs/product/product-architecture-spec.md)
- [Agent and code policy](./docs/agent-policy/local-development-rules.md)
- [Windows local setup](./docs/developer/local-setup-windows.md)
- [AWS deployment plan](./docs/ops/aws-deployment-plan.md)
- [AWS testing runbook](./docs/ops/aws-testing-environment-runbook.md)
- [Integration platform roadmap](./docs/roadmap/integration-platform-roadmap.md)

## Stack

- **Backend:** Node.js, Express, Prisma ORM, SQLite (local dev) / PostgreSQL (AWS),
  JWT auth, node-cron (local scheduler), Jest + Supertest (tests).
- **Frontend:** React 18, Vite, React Router v6, Tailwind CSS.
- **Connectors:** every external call goes through a `real.js`/`mock.js` pair under
  `src/connectors/<name>/`, selected per-execution by execution mode.

## Project layout

```text
src/
  core/          execution engine: auth, permissions, integration-loader,
                 execution-runner, webhook-runner, schedule-runner, manual-runner,
                 credentials, secrets, queue, scheduler, testing-runner, logger
  routes/        Express routers (auth, admin, integrations, webhooks, executions,
                 logs, test)
  connectors/    whatsapp / generic-rest / email, each with real.js + mock.js
  integrations/  per-user integration folders (user_xxx/slug/{integration,handler}.js)
  db/            Prisma client singleton
prisma/          schema.prisma + seed.js
tests/           unit/ + integration/ (Jest + Supertest against the real app)
frontend/dashboard/   React dashboard (separate package.json, own npm install)
local-data/      gitignored: SQLite db file + encrypted local secrets store
```

## Backend — local setup

Requires Node.js LTS.

```bash
cd <project-root>
npm install                 # also runs `prisma generate` via postinstall
cp .env.example .env        # already present in this repo; review values
npm run db:migrate          # creates prisma/migrations + local-data/dev.db
npm run db:seed             # seeds admin + 2 users + sample integrations
npm run dev                 # http://localhost:3001
```

Seeded accounts (see `prisma/seed.js`):

| Email | Password | Role |
|---|---|---|
| admin@example.com | Admin123! | admin |
| user1@example.com | User123! | user (owns `whatsapp-order` webhook + `stock-sync` scheduled) |
| user2@example.com | User123! | user (owns `whatsapp-order` webhook) |

Run the automated test suite (own isolated SQLite file + secrets file, created/torn
down automatically — never touches your dev data):

```bash
npm test
```

Local environment modes (`.env`): `AUTH_MODE=mock` (real JWTs, no Cognito),
`QUEUE_MODE=local` (jobs run in-process), `SECRETS_MODE=local` (AES-256-GCM file
at `local-data/secrets.local.json`), `SCHEDULER_MODE=local` (node-cron in-process),
`CONNECTOR_MODE=mock`. See the [AWS deployment plan](./docs/ops/aws-deployment-plan.md) for the AWS-mode
equivalents.

## Frontend — local setup

```bash
cd frontend/dashboard
npm install
npm run dev                 # http://localhost:5173, proxies /api + /webhooks to :3001
```

No `.env` needed by default — the Vite dev server proxies API calls to
`http://localhost:3001`. To point at a different backend, set `VITE_PROXY_TARGET`
(dev proxy) or `VITE_API_URL` (production build) — see
`frontend/dashboard/.env.example`.

The visible dashboard app version is read from `frontend/dashboard/package.json`.
It appears on the login page and in the authenticated dashboard footer so QA and
users can confirm which frontend build is running.

Each integration also has its own private version stored on the integration
record. The dashboard shows that version next to the integration name, shows the
internal integration ID, and lets permitted users edit the integration name and
private version inline from the integration detail header.

When integration code or metadata changes, bump both the application version and
that integration's private version on its integration record so the dashboard
reflects the deployed integration behavior.

The Priority Quote Notification to WhatsApp integration reads the WhatsApp recipient from CPROF.ROYY_PHONE in the Priority webhook payload, uses `priority-web-sdk` in live mode to generate a Priority price quotation print/document URL from CPROF.CPROFNUM, and inserts the generated URL suffix as the WhatsApp template URL button parameter `{{1}}`. Configure the template with a static prefix such as `https://priority.simplyct.co.il/netfiles/{{1}}`; the API payload sends only the generated `.htm` filename/suffix. Its logs show four clear sanitized steps: JSON from Priority, Priority print URL prepared before WhatsApp post, JSON to WhatsApp, and WhatsApp response. The JSON-to-WhatsApp log keeps phone/customer/token/password values redacted but shows the generated URL button parameter and the full generated Priority document URL for verification.

New/changed credentials for that integration are configured in the dashboard: `WHATSAPP_ACCESS_TOKEN` is now a secret field, `WHATSAPP_BUTTON_URL_PREFIX` defines the static WhatsApp template URL prefix before `{{1}}`, and the Priority print URL step requires `PRIORITY_WEB_SDK_URL`, `PRIORITY_WEB_SDK_TABULAINI`, `PRIORITY_WEB_SDK_LANGUAGE`, `PRIORITY_WEB_SDK_COMPANY`, `PRIORITY_WEB_SDK_APPNAME`, `PRIORITY_WEB_SDK_USERNAME`, `PRIORITY_WEB_SDK_PASSWORD`, and optional `PRIORITY_WEB_SDK_DEVICENAME`. The Priority Web SDK default language is `1`, the default username is `shely.l`, and the quote lookup sort option is sent as `לפי מספר ההצעה`. Test, dry-run, and mock-output modes use a mock Priority print URL and do not call Priority or WhatsApp; live mode calls both Priority and WhatsApp.

## AWS API/dashboard pipeline

The repository root also includes `buildspec.yml` for generic CodeBuild projects.
It installs root dependencies with Node.js 20, runs `npm test` when tests are
configured, and excludes `node_modules/` plus `.git/` from the output artifact.
The API/dashboard EB pipeline uses `buildspec-api-eb.yml`; its artifact also
excludes all `node_modules/` folders so Elastic Beanstalk installs dependencies
on the target Node.js platform instead of receiving CodeBuild's dependency tree.

Use `infra/aws/scripts/create-codeconnection.sh` first if the AWS account does not
already have a GitHub CodeConnection. Complete the pending GitHub handshake in the
AWS console, then pass the connection ARN to the API pipeline script:

```bash
./infra/aws/scripts/create-pipeline-api.sh \
  --github-owner benmen1980 \
  --github-repo automation \
  --connection-arn arn:aws:codestar-connections:eu-west-1:123456789012:connection/example \
  --eb-application automation \
  --eb-environment automation-api \
  --branch master \
  --region eu-west-1 \
  --create-roles
```

The script creates or updates:

- an S3 artifact bucket with versioning and public access blocked
- scoped CodePipeline and CodeBuild IAM roles when `--create-roles` is passed
- a CodeBuild project that runs `buildspec-api-eb.yml`
- a CodePipeline V2 pipeline from GitHub to Elastic Beanstalk

Pipeline trigger behavior:

- Runs for `master` pushes touching API/dashboard deployment files such as
  `apps/api/**`, `src/**`, `frontend/dashboard/**`, `packages/shared/**`,
  `prisma/**`, dot-directory EB config, package files, or buildspec files.
- Excludes `integrations/**` and `src/integrations/**`, so integration-only
  changes do not redeploy or restart the Elastic Beanstalk API/dashboard.
- Uses `DetectChanges=false` on the source action and a CodePipeline V2 Git push
  trigger with branch and file path filters.

You can pass existing roles instead of creating them:

```bash
./infra/aws/scripts/create-pipeline-api.sh \
  --github-owner benmen1980 \
  --github-repo automation \
  --connection-arn <connection-arn> \
  --eb-application automation \
  --eb-environment automation-api \
  --codepipeline-role-arn <pipeline-role-arn> \
  --codebuild-role-arn <build-role-arn>
```

## Adding a new integration

Per the [product architecture spec](./docs/product/product-architecture-spec.md), integration code is never uploaded or loaded from a URL
parameter — it must already exist on disk before it's registered:

1. Create `src/integrations/<user_slug>/<integration-slug>/integration.js` +
   `handler.js` (see the existing examples for the contract both files must follow).
2. In the dashboard (or via `POST /api/integrations`), create the integration record
   pointing at that `codeFolder` — the backend validates both files exist and that
   `integration.js` parses before saving.
3. Configure credentials, then use **Run / test** on the integration page (dry run,
   mock output, or a live test) before wiring up the real webhook URL or schedule.

## Testing tools available in the dashboard

Per the [product architecture spec](./docs/product/product-architecture-spec.md): every integration page supports Run (with execution mode
test/dry_run/mock_output/mock_input/live), a dedicated Dry Run button, sample
payloads pulled from `integration.js`'s `testPayloads`, a Test Credentials panel
(calls the connector's `testConnection`), and per-execution Replay. Webhook tests
go through the exact same runner as the real public webhook endpoint — there is no
separate fake test path.

Connector mode contract: `live`, `test`, `mock_input`, and `replay` use real
connector modules with the integration's saved credentials; `dry_run` executes
handler logic but skips connector calls without logging request arguments; and
`mock_output`/`dummy` use mock connector modules.

## Acceptance Criteria

Every line item, with where it's enforced:

| Criterion | Where |
|---|---|
| Admin can create a user | `POST /api/admin/users` (`admin-routes.js`) |
| Admin can create an integration for a user | `POST /api/integrations` (admin may set `userId`) |
| System loads `integration.js` | `core/integration-loader.js`, validated on integration creation |
| Dashboard displays credential fields dynamically | `CredentialForm.jsx` renders from `GET /:id/credentials` |
| User can save credentials | `POST /api/integrations/:id/credentials` → `core/credentials.js` |
| Secret credentials never returned to frontend | `credentials.js` `listCredentialsForDisplay` — secret fields always `value: null` |
| User can run an integration manually | `POST /api/integrations/:id/run` (disabled client-side if `manualRunEnabled` is false) |
| Webhook can be tested without a real third party | `POST /:id/test` → same `webhook-runner.runWebhook` the public route uses, `skipTokenCheck` defaulted true |
| Scheduled integration can be tested without waiting | same `/:id/test` endpoint, `IntegrationPage.jsx` Run/test panel |
| Dry run skips the real connector | `tests/integration/execution-flow.test.js` ("dry_run skips the real connector") |
| Mock connector returns a mock response | same test file ("mock_output uses the mock connector") |
| Execution record created per run | enforced in `execution-service.js`, exercised by every integration test |
| Logs saved under user + integration + execution | `Log` model + every log write path |
| User cannot see another user's logs | `tests/integration/log-isolation.test.js` |
| Failed integration marked failed | `execution-flow.test.js` ("failed handler marks execution failed") |
| Replay reruns a previous payload as test | `execution-flow.test.js` ("replay copies the original payload") + `ExecutionPage.jsx` Replay button |
| Automated tests pass before deployment | gated in CI per the [AWS deployment plan](./docs/ops/aws-deployment-plan.md); **not yet run** in this environment — see Known limitations below |

## Known limitations / what's not done here

- This was built and verified in a sandboxed environment without npm registry
  access, so `npm install` and `npm test` were never actually executed here — run
  them on your machine before deploying. Every test assertion was verified by
  re-reading the route/core source it exercises, not by running the suite.
- No AWS resources are created automatically during local setup. Use the AWS scripts
  under `infra/aws/scripts/` to create the API/dashboard pipeline, Elastic
  Beanstalk environment, queues, integration workers, and integration pipelines.
  The [AWS deployment plan](./docs/ops/aws-deployment-plan.md) documents the target
  architecture and the exact swap points in the code (`SECRETS_MODE=aws`,
  `QUEUE_MODE=sqs`, `SCHEDULER_MODE=aws`, Cognito), but the AWS deployment still
  needs to be run and load-tested in your account.
- Per the [product architecture spec](./docs/product/product-architecture-spec.md) scope: no drag-and-drop builder, no code upload from the dashboard,
  no billing, no marketplace.
