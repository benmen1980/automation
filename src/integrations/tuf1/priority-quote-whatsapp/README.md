# Priority Customer Order to ITC

Automation `cmrtomudr0001105jk8e1spo6` receives a Priority customer-order webhook, generates the sales-order confirmation with `priority-web-sdk`, saves a copy on the automation server, and sends the server-hosted URL through the Effective/ITC template-message REST API. ITC delivers the message over its configured WhatsApp channel; this integration does not call Meta WhatsApp Cloud API directly.

## Contract

- Source: Priority webhook payload.
- Target: ITC template-message REST API.
- Direction: `OUTBOUND`.
- Triggers: webhook and manual dashboard run.
- Authentication: Priority webhook verification token, Priority Web SDK username/password, and ITC bearer token.
- Runtime target: Lambda worker behind its integration queue and DLQ.
- Local runtime: the same independent worker package in a child-worker process; the API-side connector is settings/login-only.
- Schedule: none.

## Incoming payload and mapping

The live webhook must contain raw text values. Redacted objects are log summaries only and are rejected as executable input.

```json
{
  "ORDERS": {
    "ORDNAME": "SO26000001",
    "ZANA_CUSTDES": "׳™׳¨׳“׳",
    "ZANA_PHONENUM": "+972507573753"
  }
}
```

| Priority source | ITC target | Rule |
| --- | --- | --- |
| `ORDERS.ZANA_PHONENUM` | `clientName` | Normalize Israeli/local input to E.164 with a leading `+` |
| Static | `msgType` | Always `whatsapp` |
| Saved `ITC_CHANNEL_ID` | `channelId` | Must use `whatsapp:+<number>` |
| `ORDERS.ZANA_CUSTDES` | `variables[0].text` | ITC text variable 1 |
| `ORDERS.ORDNAME` | `variables[1].text` | ITC text variable 2 |
| Automation server copy of the Priority `WWWSHOWORDER` document | `variables[2].text` | Full server-hosted sales-order confirmation URL |

The outgoing request shape is:

```json
{
  "clientName": "+972507573753",
  "msgType": "whatsapp",
  "channelId": "whatsapp:+97246960480",
  "variables": [
    { "type": "text", "text": "׳™׳¨׳“׳" },
    { "type": "text", "text": "SO26000001" },
    { "type": "text", "text": "https://automation.example.com/documents/priority-orders/exec-1.htm" }
  ]
}
```

## Dashboard settings

The ITC settings section shows:

- `ITC_TEMPLATE_MESSAGE_URL`: full HTTPS template-message endpoint, including the template ID.
- `ITC_BEARER_TOKEN`: secret; masked after saving and never returned by the API.
- `ITC_CHANNEL_ID`: sending channel, default `whatsapp:+97246960480`.

The Priority settings section uses the same Web SDK credential shape as automation `cmqwxeyem00019hv5q0mbml0g`:

- `PRIORITY_WEB_SDK_URL`, `PRIORITY_WEB_SDK_TABULAINI`, `PRIORITY_WEB_SDK_LANGUAGE`.
- `PRIORITY_WEB_SDK_COMPANY`, `PRIORITY_WEB_SDK_APPNAME`, `PRIORITY_WEB_SDK_USERNAME`.
- `PRIORITY_WEB_SDK_PASSWORD`: secret; masked after saving.
- Optional `PRIORITY_WEB_SDK_DEVICENAME`.
- `PRIORITY_WEB_SDK_ORDER_SORT_OPTION`: desired field 2 choice. The default `By Order Number` selects Priority's first ג€By Order Numberג€ choice even when the session displays it in another language; non-default values must exactly match a choice returned by Priority.

The bearer token supplied during development was exposed outside the secret store. Rotate it before configuration, then enter the replacement only through the dashboard.

The **Check ITC settings** action validates the saved endpoint, token presence, and channel format without sending a message. **Test Priority Web SDK login** authenticates without running `WWWSHOWORDER` or generating a document.

## Test modes

- `dry_run`: validates and maps the payload with a mock confirmation URL; does not call Priority or ITC.
- `test`: behaves like dry run for safe dashboard testing.
- `mock_output`: uses a mock Priority confirmation URL and mock accepted ITC response; no external system is called.
- `live`: logs in to Priority, runs `procStart('WWWSHOWORDER', 'P', null)`, follows the returned procedure screens, supplies `ORDNAME` as field 1, selects field 2 through Priority's own Sort choice list, requests print format code `-109`, validates the generated HTTPS URL, saves it on the automation server, and then sends the server URL in the real ITC POST. Any ITC HTTP `2xx` is treated as accepted.

## Logs and failures

Logs use these directional steps:

- `Received from Priority`
- `Sent to Priority` (`WWWSHOWORDER`)
- `Received from Priority` (document URL summary)
- `Sent to ITC`
- `Received from ITC`

`ORDNAME`, `ZANA_PHONENUM`, `clientName`, generated document paths, passwords, bearer tokens, and authorization headers are redacted. Logs retain only the document URL host/protocol and keep `ZANA_CUSTDES` visible as requested. Priority failures identify the exact failed stage, safe HTTP status/error code when available, and an actionable next step. Authentication/configuration failures are terminal; transient network, timeout, throttling, and server failures remain retryable before any ITC delivery.

The connector has a 15-second request timeout and does not retry automatically because a timed-out request may already have been accepted. Queue-level retry and deduplication policy must be configured in the independent worker deployment.

In SQS mode, the API classifies secrets from the integration definition, fails closed if database metadata disagrees, and sends integration-scoped Secrets Manager references instead of secret values. The Lambda atomically claims the execution, stores `IN_FLIGHT` immediately before the ITC request, and persists success/known failure before updating the dashboard. Retries that find `IN_FLIGHT` require reconciliation and never resend automatically. ITC 5xx and network failures are ambiguous and are not retried; only safe pre-delivery failures may retry. On the third receive attempt, a retryable pre-delivery failure is durably finalized as `FAILED` before DLQ transfer.

## Rollback

Rollback the integration worker artifact and restore integration version `1.3.0` to return to the static `dummy.com` variable 3 behavior. Do not redeploy or restart the main API/dashboard solely to roll back the worker.

Legacy direct-WhatsApp credentials are retained only for the older `1.2.4` rollback path. Version `1.4.0` neither loads nor displays them; remove them securely after the integration owner closes that rollback window.
