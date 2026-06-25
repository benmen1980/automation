# Local Development

This repository now supports npm workspaces while keeping the existing local API app working.

## Install

```bash
npm install
npm --prefix frontend/dashboard install
```

If Prisma postinstall is blocked by a locked Windows DLL, stop running Node processes and retry. For lockfile-only changes, use `npm install --package-lock-only --ignore-scripts`.

## Run The API

```bash
npm run dev:api
```

The API still starts from the existing `src/server.js` entrypoint so the current dashboard remains usable during the migration.

## Run A Worker Locally

```bash
npm run dev:worker:gmail-priority
npm run dev:worker:shopify-priority
npm --workspace @automation/salesforce-priority run dev
```

## Invoke One Integration With A Fixture

```bash
npm run invoke:gmail-priority -- --fixture fixtures/sample-job.json
```

The local runner loads only the selected integration package. It does not start the API, dashboard, scheduler, or webhook server.

## Tests

```bash
npm run test:api
npm run test:integration:gmail-priority
npm --workspace @automation/shopify-priority test
npm --workspace @automation/salesforce-priority test
npm test
```

`npm test` runs the existing API Jest suite and the worker fixture tests.
