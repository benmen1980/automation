# Priority Customer Order to ITC worker

Independent Lambda worker for automation `cmrtomudr0001105jk8e1spo6`. It consumes the automation's SQS jobs, runs Priority `WWWSHOWORDER` for `ORDERS.ORDNAME`, copies the generated sales-order confirmation to the automation server, maps the server URL to ITC variable 3, and logs to `/aws/lambda/priority-order-itc`.

This package is also the canonical implementation for local runs. The local queue launches it in a separate child-worker process; the API-side Priority connector performs login/settings checks only and does not contain or execute the `WWWSHOWORDER` flow.

Deployment resources:

- Pipeline: `integration-priority-order-itc`
- Lambda: `priority-order-itc`
- Queue: `priority-order-itc-queue`
- DLQ: `priority-order-itc-dlq` with `maxReceiveCount=3`
- Source filter: `integrations/priority-order-itc/**`, its infrastructure/shared files, the dashboard-only metadata under `src/integrations/tuf1/priority-quote-whatsapp/**`, and `scripts/sync-integration-db.js`. These paths trigger only the integration pipeline; they do not trigger the API/dashboard pipeline.

Create the isolated resources with:

```bash
API_QUEUE_ENV_SUFFIX=CMRTOMUDR0001105JK8E1SPO6 VISIBILITY_TIMEOUT_SECONDS=180 MAX_RECEIVE_COUNT=3 ./infra/aws/scripts/create-sqs-for-integration.sh priority-order-itc
./infra/aws/scripts/create-dynamodb-finalization-for-integration.sh priority-order-itc
SQS_QUEUE_ARN=<queue-arn> LAMBDA_ROLE_ARN=<role-arn> WORKER_CALLBACK_TOKEN_SECRET_ID=<secret-id> LAMBDA_TIMEOUT_SECONDS=60 MAX_RECEIVE_COUNT=3 ./infra/aws/scripts/create-lambda-integration.sh priority-order-itc
CODECONNECTION_ARN=<connection-arn> PIPELINE_ROLE_ARN=<role-arn> CODEBUILD_ROLE_ARN=<role-arn> ARTIFACT_BUCKET=<bucket> ./infra/aws/scripts/create-pipeline-integration.sh priority-order-itc
```

Configure the API with the integration-ID-specific queue variable `SQS_QUEUE_URL_CMRTOMUDR0001105JK8E1SPO6`, `INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL`, and an `INTEGRATION_WORKER_CALLBACK_TOKEN` injected from deployment secret storage. The queue contains non-secret settings and integration-scoped Secrets Manager references only. Lambda resolves both `ITC_BEARER_TOKEN` and `PRIORITY_WEB_SDK_PASSWORD` through its least-privilege IAM role; never include live secrets in an SQS message.

Live order printing uses `priority-web-sdk` with `WWWSHOWORDER` and `ORDERS.ORDNAME` as field 1. The worker follows the procedure step returned by the tenant, opens Priority's field 2 Sort chooser, submits the chooser's returned value, requests print format code `-109`, reads the generated URL, copies that document to the automation server, and sends the server URL to ITC. The default `PRIORITY_WEB_SDK_ORDER_SORT_OPTION=By Order Number` selects the first Priority choice even when its display language is not English; a non-default setting must exactly match one of the returned choices.

Failures identify the exact safe stage: login, WWWSHOWORDER startup, initial option selection, Sort selection, order parameter submission, Priority procedure validation, document/report format selection, continuation, or document URL generation. The dashboard retains the safe Priority server explanation plus a stage-specific next step while redacting the order number, username, password, authorization values, and token-shaped text. ITC is not called unless the document is copied successfully and the automation server returns a valid document URL.

The dashboard ITC settings card includes a **Test ITC message flow** panel. Paste an `ORDERS` JSON object, select a safe or live execution mode, and run the test. Safe modes do not contact Priority or ITC. Live mode requires confirmation because it generates and saves a real Priority document, then sends a real ITC message to `ORDERS.ZANA_PHONENUM` containing the server-hosted copy URL. The panel shows invalid JSON locally and links every submitted test to its execution details and logs.

Only `ORDERS.ORDNAME`, `ORDERS.ZANA_CUSTDES`, and `ORDERS.ZANA_PHONENUM` are accepted into the execution boundary. The API discards any additional pasted keys before database persistence and SQS publication. Execution modes not declared in the integration metadata are rejected before a job is created, and the worker independently permits an ITC network call only for the exact `live` mode.

The worker atomically claims an execution through the callback API. Immediately before the ITC network request it stores an `IN_FLIGHT` marker, then replaces it with provider success or a known terminal failure before calling back. A retry that finds `IN_FLIGHT` treats delivery as ambiguous and never resends automatically. ITC 5xx and network failures are also treated as ambiguous because ITC has not documented an idempotency key or safe-retry guarantee. Safe pre-delivery failures, such as a temporary Priority print failure, may retry; on receive attempt 3 the worker stores `FAILED` and calls the dashboard before SQS can move the record to the DLQ.

Local tests:

```bash
npm run test:integration:priority-order-itc
npm run invoke:priority-order-itc -- --fixture fixtures/sample-job.json
```

Rollback by deploying the previous worker artifact and updating the dashboard integration version to the matching private version. Worker rollback must not deploy or restart the API/dashboard.

After an integration deployment or dashboard-metadata change, run `npm run sync:integration-db` against the target database so the dashboard version matches the worker. The sync upserts metadata only and preserves all saved credentials and secret references.

Rollback to worker `1.3.0` to restore the static variable 3 behavior. Legacy direct-WhatsApp credentials are retained temporarily only for the older `1.2.4` rollback path; version `1.4.0` ignores and hides them.
