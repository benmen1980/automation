# Shared execution failure notifications

Scope: PLATFORM/ADMIN. No automation recipient field, address normalizer, or email
template is implemented here. The hooks are opt-in; existing workers are not
silently wrapped. No business operation is invoked by the notification service.

## Automation integration contract

The server-loaded `integration.js` exports an optional `failureNotification`:

```js
failureNotification: {
  recipientsKey: 'YOUR_AUTOMATION_SETTING_KEY',
  resolveRecipients(savedValue) { /* Return validated, normalized string[]. */ },
  async buildMessage({ execution, attempt, stage, error, logs, through }) {
    // Return { subject: string, text: string }. Implement the English template
    // in the automation package. Do not read global recipients.
  },
}
```

Only this automation's non-secret Credential row is read. No credentials/secret
resolution is needed to send a configuration-load or enqueue failure. Missing
recipients records `automation.alert.skipped`. Opted-in automations bypass the
old global SendGrid notification in `markFailed`.

The server service is `src/core/execution-alerts.js`:

- `notifyExecutionFailure(executionId, error, { attempt, stage })` returns a status
  and never throws. Supply the actual positive attempt number. A durable unique
  Log ID claims one notification per execution+attempt, across processes and
  restarts. This deliberately coalesces multiple reports of the same failed attempt.
- `collectExecutionLogs(executionId, { integrationId, through = new Date() })`
  returns all persisted entries, across attempts, sorted by timestamp then ID.
  No pagination cap and no traversal of manual replays (`sourceExecutionId`).
  Message and metadata are redacted again. `logs[].metadata` is parsed JSON where
  possible; `createdAt` is the event time. Logs already redacted cannot be restored.

Notifications log claimed, started, SES accepted, failed, or skipped. The snapshot
includes the started entry; the accepted/failed result is stored only afterwards.
Accepted means SES accepted the request, not inbox delivery. SES is pinned to
eu-west-1, sender and feedback address roy@simplyct.co.il. SDK retries are disabled;
an uncertain send is not retried automatically. A failed/uncertain attempt retains
its claim, so at-most-once dispatch can sacrifice delivery after a crash.

## Lambda: wrap each SQS record, before configuration loading

```js
import { withExecutionTelemetry } from '@automation/shared';

await withExecutionTelemetry(job, {
  attempt: Number(record.attributes.ApproximateReceiveCount || 1),
  timeoutMs: context.getRemainingTimeInMillis(),
}, () => existingWorkerInvocation(job));
```

Use the existing shared `createLogger({ jobId: job.executionId || job.id })` inside
the wrapper. Await all business work and logging producers before returning;
throw the original failure from the callback. If the worker intentionally returns
a failure value instead of throwing, finish/report that failure explicitly.
Do not wrap notification handling in a business retry. The wrapper preserves the
original return/throw and does not rerun the callback.

Logs stream to the API and are flushed before finish/notification. Retransmission
is idempotent per log entry. The logger no longer truncates metadata strings at
160 characters. Only the matching job ID is captured; AsyncLocalStorage isolates
concurrent invocations. Existing status callbacks carry `telemetryManaged: true`
within the wrapper, deferring notifications until its log flush. Without the
wrapper, legacy callbacks have a best-effort notification hook but cannot promise
a complete Lambda log or correct SQS attempt numbering.

Internal authenticated endpoint:
`POST /api/internal/integration-executions/:executionId/telemetry`
uses the existing worker bearer token and verifies integrationId against the run.
Body always contains `{ integrationId, attempt }`, plus:

- `{ phase: 'start', timeoutMs }` persists the watchdog deadline (max 24h).
- `{ phase: 'logs', entries: [{ id, time, level, message, metadata }] }` persists
  up to 100 entries per request. API body limit remains 2 MB; no silent truncation.
- `{ phase: 'finish', errorMessage? }` records completion, then optionally alerts.

`AUTOMATION_WORKER_CALLBACK_TOKEN` or its existing Secrets Manager reference is
used by the shared client; the API uses `INTEGRATION_WORKER_CALLBACK_TOKEN`.

## Crashes and limits

The API watchdog checks durable starts every 30 seconds, with 30 seconds grace
after the deadline. It resumes checking on API restart and reports a missing
completion acknowledgement: crash, timeout, or callback/network outage. It does
not claim these causes can always be distinguished, does not alter business status,
and does not requeue business work. Local child exit/timeout and enqueue errors
also feed the shared notification hook.

For hard termination, only logs acknowledged by the API are available. Memory-only
logs, raw console output, Lambda platform START/END/REPORT, and historical CloudWatch
logs are not collected by this transport. A complete log cannot be guaranteed if
the process dies before persistence. An upload failure suppresses normal finish;
the watchdog reports the missing acknowledgement instead. Loss of the initial
watchdog registration, database outage, or an unloaded/broken notification adapter
can prevent alerting. A running API and working database are required for the
watchdog; this is not an independently hosted AWS failure detector. Monitor those
services separately. Do not describe a watchdog snapshot as a complete lost-process
log. Very large log/email payloads fail visibly rather than being truncated.

## SES handoff, 11 November 2026

Account 437826626852, eu-west-1: ProductionAccessEnabled=false, review DENIED,
case 179440689800513. The case correspondence asked for additional information,
not a specific disclosed rejection reason. A full response was submitted through
Support Center at 21:53 Israel time covering all six requested items and explicitly
stating the implementation is in progress. Until approved, ordinary sending is
restricted to verified recipients. Sender verification and feedback forwarding
were checked; suppression includes BOUNCE and COMPLAINT. Prior simulator feedback
receipt in Microsoft 365 was confirmed by the owner. Recipient removal is manual.

Verified available IAM permissions:
- API EC2 role `aws-elasticbeanstalk-ec2-role`: ses:SendEmail,
  ses:GetEmailIdentity, ses:GetAccount via automation-ses-access.
- Worker role `automation-platform-priority-order-itc-lambda-role`:
  ses:SendEmail only from roy@simplyct.co.il in eu-west-1, identity-scoped, via
  automation-alerts-ses-send. The shared path sends from the API, so no new worker
  AWS permission is needed; existing callback access is used.

Validation: focused Jest tests cover claims/concurrency, separate attempts, 1200+
logs, isolation/redaction/cutoff, skip, SES rejection, storage failure and watchdog;
existing queue/execution/log-isolation tests also run. Native Node tests cover the
worker wrapper's full log flush and preservation of the original error.
