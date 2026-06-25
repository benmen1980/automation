# Local Development Rule

After every code change, restart both local services so the running app picks up the latest backend and frontend files.

## Restart Backend

Stop the current backend process listening on port `3001`, then start it again from `C:\gpt\automation`:

```powershell
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'src/server.js' -WorkingDirectory 'C:\gpt\automation' -WindowStyle Hidden -PassThru
```

## Restart Frontend

Stop the current frontend process listening on port `3002`, then start it again from `C:\gpt\automation\frontend\dashboard`:

```powershell
Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run dev -- --host 127.0.0.1 --port 3002' -WorkingDirectory 'C:\gpt\automation\frontend\dashboard' -WindowStyle Hidden -PassThru
```

## Verify

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/health
Invoke-WebRequest -UseBasicParsing http://localhost:3002/health
```

Expected result: both return HTTP `200`, and `/health` through port `3002` should proxy to the backend.

## Mandatory Integration Delivery Gate

Before creating or modifying an integration, run the project integration checklist in `C:\gpt\automation\AGENTS.md`. Do not build from a vague request alone when the provider, auth method, trigger, data mapping, test modes, logging plan, or credentials are unclear.

Every integration change must include:

- Contract validation: run `npm run validate:integrations`.
- UI/UX review: confirm fields, helper text, saved feedback, test controls, and secret masking are clear to a non-technical user.
- Log review: confirm logs are structured, useful for debugging, directional, and sanitized.
- Security review: confirm no tokens, passwords, API keys, authorization headers, refresh tokens, or sensitive personal data are exposed in UI, logs, console output, or screenshots.
- Deployment review: confirm integration logic belongs in its own worker/queue/log stream/deployment path and does not require redeploying the main API/dashboard.

If a UI/UX or log-review agent is available, use it. If not, perform the review directly and report it in the final response.

## Integration Logging Review Rule

Each integration must define and satisfy a logging plan. Logs must be readable to a human and useful for debugging without exposing secrets.

Required log behavior:

- Log each important process step.
- Log direction clearly, using phrases such as `Received from WhatsApp`, `Sent to Priority`, `Received from Priority`, or `Sent to Salesforce`.
- Include integration name, job ID, trigger type, start time, end time, status, request payload summary, response payload summary, and safe error message.
- When an API call fails, show which API failed, the endpoint/action name, HTTP status when available, safe response body when available, and a clear explanation.
- Redact secrets, passwords, tokens, API keys, refresh tokens, authorization headers, connection strings, and sensitive personal information.
- Use per-integration CloudWatch log groups or clearly identifiable log streams.
- Show simple user-facing job status/logs in the dashboard; keep detailed technical logs in CloudWatch.

Every `integration.js` must include logging metadata:

```js
logging: {
  direction: 'INBOUND',
  reviewRequired: true,
  cloudWatchLogGroup: 'integration-provider-purpose',
  steps: ['Received from Provider', 'Sent to Target'],
}
```

## Priority ERP Credentials Rule

For any Priority ERP integration, credentials must follow the official Priority ERP REST API documentation and naming/shape expected by that API.

Do not invent Priority credential fields ad hoc. Before implementing or generating a Priority integration, confirm the required REST API authentication details from the Priority ERP REST API docs, then reflect those fields in the integration's `integration.js` credential schema.

Typical placeholder fields used in local templates, such as `PRIORITY_API_URL` and `PRIORITY_API_KEY`, are only dummy local-development fields until replaced with the exact production credentials required by the official Priority REST API setup.

## Integration Specification Rule

Before creating or generating code for any integration, the integration owner must provide the Postman/API structure for both sides of the flow: the `from` system and the `to` system.

Example: for `Shopify -> Priority`, provide:

- Shopify credentials and authentication method.
- Priority credentials and authentication method.
- Shopify Postman collection/request examples for the relevant source API or webhook payload.
- Priority Postman collection/request examples for the target API that will receive/create/update data.
- Sample request bodies, headers, query params, path params, and expected responses for both systems.
- The exact business purpose of the integration: what event or schedule starts it, what data is read, how fields map, what data is written, and what should happen on success or failure.

Do not generate integration code from a vague description only. First ask app-specific questions according to the systems involved and their official documentation.

Examples of required discovery questions:

- For Shopify: ask which Shopify API version, webhook topic or REST/Admin endpoint, required scopes, shop domain, payload shape, rate-limit expectations, and whether test mode should use captured webhook JSON or dummy REST responses.
- For Priority ERP: ask for the exact REST API endpoint, auth method, company/environment, entity/form name, required fields, lookup keys, update/create behavior, and error response examples based on the official Priority ERP REST API docs.
- For any target system: ask whether the integration should create, update, upsert, delete, or only simulate writes in dry-run mode.
- For any source system: ask whether data comes from a webhook payload, scheduled REST polling, a file/export, or a manual test payload.

The final integration spec must be clear enough that local `dummy`, `test`, and `dry_run` modes can be built before using live credentials.

## Mandatory Clarification Before Building Integrations

Before creating, registering, or generating code for any new integration, Codex must stop and ask specific clarification questions to collect the exact integration instructions and technical details.

Do not proceed directly from a short request such as "create Shopify to Priority" or "make a scheduled Priority task." First ask for the missing details required to build the integration safely.

At minimum, ask for:

- The source system (`from`) and target system (`to`).
- Whether the trigger is scheduled, webhook, or manual.
- The exact business goal in plain language.
- The exact data to read from the source system.
- The exact data to write to the target system.
- Field mapping rules between source and target.
- Required credentials for each side.
- Postman/API examples for both sides, including URL, method, headers, params, body, and response examples.
- Which official API documentation/version applies for each system.
- Test payloads or dummy data to use locally.
- What should happen in `dummy`, `test`, `dry_run`, and `live` modes.
- Success criteria and failure/retry behavior.
- Where any local files should be written, if the integration writes files.

Only after these answers are clear should Codex create the integration files, DB registration, credentials schema, schedule/webhook settings, tests, or local dummy execution.

## Integration UI Contract Rule

Each integration's `integration.js` must describe only the fields and controls that are actually relevant for that integration. The dashboard must use this metadata to avoid showing generic, irrelevant controls.

For every integration, define:

- `credentials`: only credentials needed by this integration.
- `connectors`: only connectors used by this integration, such as `priority`, `shopify`, `gmail`, `whatsapp`, `email`, or `genericRest`.
- `credentialTests`: only connector credential tests that make sense for this integration. Do not show WhatsApp/email/generic credential tests unless that integration uses them.
- `testing.allowManualPayload`: `false` when the source request has no body or when user-supplied payload is irrelevant.
- `testing.defaultMode`: the safest default mode for the integration.
- `testing.modes`: the exact modes allowed for this integration. Do not show every global mode by default.
- `testing.modeDescriptions`: plain-language explanation of what each allowed mode does for this specific integration.
- `testPayloads` or `sampleData`: embedded dummy data that lets the user test locally without calling real external systems.

The form must not show a Postman/request body editor for GET requests or integrations where the provided Postman structure has no body. For example, `Priority inventory to file` reads Priority PARTBAL with GET, so local `test` mode should use embedded dummy inventory data and should not ask the user for a JSON body.

Dry run must be explained per integration. For file-writing integrations, dry run should avoid live external API calls and should avoid writing the final output file unless the integration explicitly says otherwise; it should report what it would do.

Live mode must be clearly labeled as using real credentials and real external API calls. Live mode should only be used after credentials and dummy/test mode are verified.

## Admin UI/UX Rule

Integration admin pages must be designed for desktop readability first, with a clean two-column layout when screen width allows it.

Use this structure unless a specific integration needs something else:

- Left column: primary configuration, such as schedule/webhook settings, relevant credentials, and run/test controls.
- Right column: operational feedback, such as credential tests, recent executions, and logs.
- Header area: show compact status facts such as last run, last result, trigger type, and current schedule.

Schedule settings must be human-readable by default. Do not expose raw Unix cron as the main UI. Offer plain options first, such as:

- Every minute.
- Every X minutes.
- Every hour at a selected minute.
- Every day at a selected time.
- Custom cron only as an advanced option.

Every form field must have a short helper text, placeholder, or sample value when it prevents confusion. Use embedded sample data near the relevant test controls, especially for offline tests.

The UI must be metadata-driven per integration. Do not show irrelevant body editors, connector tests, credential groups, WhatsApp/email fields, or generic test options when the integration does not need them.

Testing modes must be explained beside the run button in plain language for that exact integration. `test`, `dry_run`, and `live` must never feel interchangeable: the user must understand whether an action calls external systems, writes files, or only simulates behavior.

## Password Field UI Rule

Every password or secret input in the admin UI must include a show/hide control, commonly represented as an eye action. The field should remain hidden by default, and the user must be able to reveal the value they are currently typing before saving.

Saved secret values must still never be returned from the backend or displayed in the UI. The show/hide control only applies to the current input value entered by the user.

## Failed Execution Logs Rule

Failed executions must include enough sanitized detail for debugging. At minimum, failure logs should include the error message, error name, stack trace when available, execution id, integration id/name/slug, trigger type, and execution mode.

The dashboard must render this metadata in the logs UI so a failed run is actionable without requiring direct database inspection. Secret values, authorization headers, passwords, tokens, API keys, and connection strings must remain redacted.

## Email Delivery Integration Rule

When an integration sends email, it must use a user-level sending account, not a shared global platform mailbox, unless the user explicitly requests otherwise.

For Gmail-based delivery, collect the Gmail account email and Gmail app password as secret/user-owned credentials, and collect recipient groups through the integration UI when recipients vary by integration.

If the user asks for a real email test, define a dedicated test mode such as `email_test`: it may use embedded dummy source data, but it must send a real email through the configured user email account. Do not call unrelated live source systems during an email-only test unless the integration spec explicitly requires it.

## Integration Test Design Rule

When creating any new integration, Codex must ask the user what type of tests the integration should have before generating the integration.

Do not assume one standard test pattern for all integrations. Each integration can require different tests according to its functionality, trigger type, side effects, and technology stack.

Examples:

- A file-writing integration may need `test` with embedded dummy data and `dry_run` with no file write.
- An email integration may need an `email_test` mode that sends a real test email through the configured user email account.
- A webhook integration may need captured webhook payload replay and token-validation tests.
- A REST polling integration may need dummy source data, mocked target writes, and a separate live credential test.

The final integration spec must explicitly define the allowed modes, what each mode calls, what each mode writes/sends, and what must never happen in that mode.

## Version Bump Rule

Every time code is modified, bump the application version in the relevant `package.json` file before finishing the task.

The current application version must appear visibly in the dashboard footer so QA and users can confirm which code version is running.

Documentation-only changes do not require a version bump unless they also change runtime code.

## Integration Documentation Rule

Every integration must include documentation that explains the integration process, requirements, and technical behavior.

At minimum, each integration folder should include a documentation file describing:

- Business purpose and owner/user.
- Trigger type and schedule/webhook/manual behavior.
- Source system, target system, and data flow.
- Required credentials and where they are configured.
- Required Postman/API examples or official documentation references.
- Test modes and exact behavior for each mode.
- Live-mode behavior and side effects.
- Logging, failure handling, retry expectations, and output artifacts.
- Field mapping or transformation rules.

## Token Helper Link Rule

Every token, app-password, API-key, OAuth-secret, or provider-secret credential field must include helper text and, when available, a `helperUrl` pointing to the exact provider page where the user creates or manages that token.

Use `helperUrlLabel` for clear link text such as `Create Gmail app password`, `Create Shopify access token`, or `Open WhatsApp token settings`.

The dashboard credential form must render these helper links beside the field helper text. Links should open in a new tab and must never include the user's actual secret value.
