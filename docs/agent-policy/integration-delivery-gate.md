# Integration Delivery Gate

Use this gate before creating or modifying any integration.

## Intake Questions

1. What is the source system and target system?
2. Which connection method is used: REST, GraphQL, SOAP, webhook, SQL, ODBC, file exchange, email, queue, or another protocol?
3. Which authentication method is used?
4. Which base URLs, endpoints, API versions, objects, and actions are required?
5. What starts the integration: manual run, webhook, schedule, file polling, or queue event?
6. What data is read, transformed, written, created, updated, skipped, or deleted?
7. What are the exact field mappings and validation rules?
8. Which credentials, callback URLs, webhook tokens, and provider setup steps are needed?
9. Which test modes are allowed, and what does each mode call, write, or send?
10. What should happen on success, failure, retry, duplicate input, and partial failure?
11. What logs must be visible in the dashboard, and what detailed logs go to CloudWatch?
12. What worker, queue, log stream, and deployment pipeline owns this integration?

## Required Reviews

Run these reviews for every integration change:

- Integration contract review.
- UI/UX review.
- Log review.
- Security review.
- Deployment isolation review.

## Required Validation

Run:

```powershell
npm run validate:integrations
npm test
```

Run the dashboard build when UI changes:

```powershell
npm --prefix frontend/dashboard run build
```

## Acceptance

An integration is not ready until:

- The checklist answers are complete.
- `integration.js` includes a unique random code-defined `integrationKey` using the format `int_<16 lowercase letters or digits>`, credentials, connectors, credential tests, testing modes, sample data or test payloads, and logging metadata.
- Secrets are masked in the UI and never logged.
- The dashboard gives clear save, test, success, and error feedback.
- Logs show `Received from ...` and `Sent to ...` direction where applicable.
- CloudWatch/log streams are identifiable per integration.
- Main API/dashboard code does not own provider business logic.
