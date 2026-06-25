# Priority Inventory to Email

## Business Purpose

Pull inventory from Priority ERP PARTBAL and send the inventory export as a JSON attachment to a configured email recipient group.

## Direction

OUTBOUND: Priority ERP -> Gmail recipients.

## Trigger

Scheduled integration. Default schedule is every 10 minutes:

```text
*/10 * * * *
```

The schedule is inactive until Gmail OAuth credentials and recipients are configured.

## Source System

Priority ERP OData PARTBAL endpoint.

Required Priority credentials:

- `PRIORITY_INVENTORY_URL`
- `PRIORITY_BASIC_USERNAME`
- `PRIORITY_BASIC_PASSWORD`

## Target System

Gmail API using OAuth2 refresh token.

Required Gmail credentials:

- `GMAIL_USE_LOCAL_FILES` can be enabled for local development.
- `GMAIL_USER_EMAIL`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `EMAIL_TO_GROUP`
- optional `EMAIL_SUBJECT_PREFIX`

See `docs/gmail-setup.md` and `scripts/gmail-get-token.js`.

### Local Gmail token files

For local development, the Gmail connector can use Google OAuth files from:

```text
local-data/users/user_001/gmail credentails/
```

Expected files:

- `client_secret*.json`
- `token.json`

Set `GMAIL_USE_LOCAL_FILES=true` in the integration credentials. When enabled, the connector uses the local files for `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`, while still using the configured recipient group and subject settings from the app.

## Test Modes

### `email_test`

- Does not call Priority.
- Uses embedded dummy inventory from `integration.js`.
- Sends a real email through Gmail API to `EMAIL_TO_GROUP`.
- Attaches the dummy inventory as JSON.

### `live`

- Calls the real Priority PARTBAL endpoint.
- Sends a real email through Gmail API.
- Attaches the real Priority response as JSON.

## Output

No local file is written. The output artifact is the Gmail message with a JSON attachment named like:

```text
priority-inventory-email_test-YYYY-MM-DDTHH-MM-SS-msZ.json
```

## Logging

Logs include execution mode, inventory row count, attachment name, recipient count, and Gmail provider message id when available. Logs must not include OAuth secrets, refresh tokens, passwords, or full authorization headers.

## Failure Handling

Common failures:

- Missing Gmail OAuth credentials.
- Invalid/expired refresh token.
- Gmail API permission/scope error.
- Priority Basic Auth failure in live mode.
- Empty recipient group.

Failed executions should show sanitized error detail in the dashboard logs.
