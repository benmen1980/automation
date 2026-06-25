# Add A New Integration

Create a new package under `integrations/<integration-name>`.

```text
integrations/example-priority/
  src/
    handler.js
    lambda.js
    manifest.js
  fixtures/
    sample-job.json
  test/
    handler.test.js
  package.json
```

## Required Handler Contract

```js
export async function handler(job, context) {
  return { success: true };
}
```

The handler must catch only errors it can enrich or recover from. Do not call `process.exit()` from integration code. Let the runner or Lambda wrapper mark the job failed.

## Required Manifest

```js
export default {
  name: 'example-priority',
  type: 'worker',
  triggers: ['manual', 'schedule', 'webhook'],
  credentials: [
    { key: 'PRIORITY_BASE_URL', type: 'url', helper: 'Priority API base URL' },
  ],
};
```

## Local Fixture

Every integration needs at least one `fixtures/sample-job.json` file. Use mock provider responses in `mocks` so local tests do not call real systems.

## Test Requirements

Add fixture-based tests with Node's built-in test runner:

```bash
npm --workspace @automation/example-priority test
```

Tests should cover:

- happy path mapping
- missing required input
- mocked Priority response
- mocked source provider response when applicable

## Root Scripts

Add root `package.json` shortcuts for common workers when they are actively used:

```json
{
  "dev:worker:example-priority": "npm --workspace @automation/example-priority run dev",
  "test:integration:example-priority": "npm --workspace @automation/example-priority test"
}
```
