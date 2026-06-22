# User-Based Automation Platform

A Node.js automation platform where each user owns multiple **integrations**. Each
integration is a custom automation (webhook-triggered or scheduled) with its own
`integration.js` definition, `handler.js` business logic, credentials, executions,
and logs. The full product/architecture spec is in [`CLAUDE.md`](./CLAUDE.md) — this
file covers how to actually run the thing.

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
npm run dev                 # http://localhost:3000
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
`CONNECTOR_MODE=mock`. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the AWS-mode
equivalents.

## Frontend — local setup

```bash
cd frontend/dashboard
npm install
npm run dev                 # http://localhost:5173, proxies /api + /webhooks to :3000
```

No `.env` needed by default — the Vite dev server proxies API calls to
`http://localhost:3000`. To point at a different backend, set `VITE_PROXY_TARGET`
(dev proxy) or `VITE_API_URL` (production build) — see
`frontend/dashboard/.env.example`.

## Adding a new integration

Per `CLAUDE.md` 10.3, integration code is never uploaded or loaded from a URL
parameter — it must already exist on disk before it's registered:

1. Create `src/integrations/<user_slug>/<integration-slug>/integration.js` +
   `handler.js` (see the existing examples for the contract both files must follow).
2. In the dashboard (or via `POST /api/integrations`), create the integration record
   pointing at that `codeFolder` — the backend validates both files exist and that
   `integration.js` parses before saving.
3. Configure credentials, then use **Run / test** on the integration page (dry run,
   mock output, or a live test) before wiring up the real webhook URL or schedule.

## Testing tools available in the dashboard

Per `CLAUDE.md` section 9: every integration page supports Run (with execution mode
test/dry_run/mock_output/mock_input/live), a dedicated Dry Run button, sample
payloads pulled from `integration.js`'s `testPayloads`, a Test Credentials panel
(calls the connector's `testConnection`), and per-execution Replay. Webhook tests
go through the exact same runner as the real public webhook endpoint — there is no
separate fake test path.

## Acceptance criteria (CLAUDE.md §17)

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
| Automated tests pass before deployment | gated in CI per `DEPLOYMENT.md`; **not yet run** in this environment — see Known limitations below |

## Known limitations / what's not done here

- This was built and verified in a sandboxed environment without npm registry
  access, so `npm install` and `npm test` were never actually executed here — run
  them on your machine before deploying. Every test assertion was verified by
  re-reading the route/core source it exercises, not by running the suite.
- No AWS resources have been created. `DEPLOYMENT.md` documents the target
  architecture and the exact swap points in the code (`SECRETS_MODE=aws`,
  `QUEUE_MODE=sqs`, `SCHEDULER_MODE=aws`, Cognito) but none of it has been deployed
  or load-tested.
- Per CLAUDE.md scope: no drag-and-drop builder, no code upload from the dashboard,
  no billing, no marketplace.
