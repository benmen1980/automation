# Automation App Integration Instructions

These instructions must be followed whenever this automation app is extended to connect with any external system, API, database, ERP, CRM, eCommerce platform, email service, messaging service, file service, or data source.

The app must not assume that Codex, ChatGPT, or the IDE has built-in access to the requested service. Every integration must be implemented as a real Node.js integration using the provider API, SDK, database driver, webhook, file protocol, or supported connection technology.


## Codex Default Instruction Files

This content should be placed in the project root `AGENTS.md`.

Recommended project layout:

```text
C:\gpt\automation\
  AGENTS.md
  docs/
    AWS_ARCHITECTURE.md
    DEPLOYMENT_PIPELINES.md
    INTEGRATION_CHECKLIST.md
    UI_UX_RULES.md
    LOGGING_RULES.md
    ADD_NEW_INTEGRATION.md
  .codex/
    config.toml
```

Codex must treat `AGENTS.md` as the main active instruction file for this repository.

If long detailed documents exist under `docs/`, `AGENTS.md` must explicitly tell Codex to read them before working on integrations, infrastructure, UI/UX, logging, or deployment.

`README.md` is documentation only. It must not be treated as the primary instruction file.

`.codex/config.toml` is for Codex configuration and permissions only. It must not replace the architecture and integration rules in `AGENTS.md`.

## Non-Negotiable Codex Behavior

Codex must not start building a new integration until it has reviewed the integration checklist in this file.

When the user asks to create or modify an integration, Codex must first identify:

1. Provider/system name.
2. Business goal.
3. Source system.
4. Target system.
5. Sync direction: `INBOUND`, `OUTBOUND`, or `BIDIRECTIONAL`.
6. Trigger type: manual, scheduled, webhook, file polling, queue, or other.
7. Authentication method.
8. Required credentials and secret fields.
9. Required objects/entities.
10. Required field mapping.
11. Required test mode or dummy data mode.
12. Expected logs and run history.
13. Required UI screens, fields, helper text, and user feedback.
14. Deployment target: Lambda by default, ECS/Fargate only when needed.
15. Whether the integration needs its own queue, DLQ, schedule, and pipeline.

If information is missing, Codex must ask focused questions before building. If the user explicitly asks to proceed without details, Codex may create a configurable scaffold with placeholders, but must clearly document all missing values.

## Required Review Agents / Review Steps

Every integration task must include the following review steps before completion:

1. **Integration contract review**: verifies provider, auth, trigger, direction, mapping, error handling, testing, and deployment.
2. **UI/UX review**: verifies that every screen is clear, helpful, and safe for non-technical users.
3. **Logging review**: verifies that logs clearly show sent data, received data, status, failures, and redaction of secrets.
4. **Credential/security review**: verifies that secrets are masked, never logged, never exposed in API responses, and never committed.
5. **Deployment isolation review**: verifies that the integration does not restart or redeploy the main API/dashboard.
6. **Local validation review**: verifies that local tests, mock mode, and `npm run validate:integrations` pass.

If Codex has no separate agent/subagent tool available, Codex must perform these reviews directly and include the review results in its final report.

## Required Integration Metadata

Every integration must include a manifest or `integration.js` metadata file.

The metadata must describe credentials, UI helper text, logging, trigger types, and deployment behavior.

Example:

```js
export default {
  name: 'whatsapp-priority',
  displayName: 'WhatsApp to Priority',
  description: 'Receives WhatsApp messages and creates or updates records in Priority.',
  direction: 'INBOUND', // INBOUND, OUTBOUND, or BIDIRECTIONAL
  runtime: 'lambda', // lambda or fargate
  triggers: ['webhook', 'manual'],

  credentials: [
    {
      key: 'WHATSAPP_ACCESS_TOKEN',
      label: 'WhatsApp Access Token',
      type: 'secret',
      required: true,
      masked: true,
      helper: 'Meta WhatsApp Cloud API access token. Store only in Secrets Manager or .env for local development.'
    },
    {
      key: 'WHATSAPP_PHONE_NUMBER_ID',
      label: 'Phone Number ID',
      type: 'string',
      required: true,
      masked: false,
      helper: 'Phone Number ID from Meta WhatsApp API Setup.'
    },
    {
      key: 'PRIORITY_BASE_URL',
      label: 'Priority API Base URL',
      type: 'url',
      required: true,
      masked: false,
      helper: 'Base URL of the Priority API or OData service.'
    }
  ],

  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: '/aws/lambda/whatsapp-priority',
    steps: [
      'Received from WhatsApp',
      'Validated webhook payload',
      'Sent to Priority',
      'Received from Priority',
      'Sent reply to WhatsApp'
    ]
  },

  deployment: {
    independentPipelineRequired: true,
    apiMustNotRestart: true,
    queueRequired: true,
    dlqRequired: true
  },

  uiux: {
    reviewRequired: true,
    showSavedSecretPlaceholder: true,
    savedSecretPlaceholder: '•••••••• saved',
    requireConnectionTestButton: true,
    requireRunTestButton: true,
    requireHelperText: true
  }
};
```

## Local and AWS Architecture Rule

This repository must be treated as one monorepo with multiple independent services.

Recommended structure:

```text
apps/
  api/
    src/
    package.json

integrations/
  provider-purpose/
    src/
      handler.js
      manifest.js
    fixtures/
    tests/
    README.md
    package.json

packages/
  shared/
    src/
      logger.js
      configLoader.js
      queueClient.js
      secretMasker.js
      priorityClient.js
    package.json

infra/
  aws/
    scripts/

docs/
```

The main API/dashboard and every integration are separate runnable services.

Local development:

```bash
npm run dev:api
npm run invoke:provider-purpose -- --fixture integrations/provider-purpose/fixtures/sample-job.json
npm run test:integration:provider-purpose
npm run validate:integrations
```

AWS deployment:

```text
apps/api                      -> Elastic Beanstalk or ECS API service
integrations/provider-purpose -> Lambda by default
heavy integrations            -> ECS/Fargate only when Lambda is not enough
```

## Main API / Dashboard Rules

The main API/dashboard may only:

1. Receive webhooks.
2. Authenticate users.
3. Show dashboard screens.
4. Manage integration settings.
5. Save credentials safely.
6. Show job status and user-facing logs.
7. Create jobs.
8. Enqueue jobs.
9. Trigger manual test runs by enqueueing a test job.
10. Show connection test results.

The main API/dashboard must never:

1. Import integration implementation code directly.
2. Execute integration business logic in-process.
3. Crash because an integration worker failed.
4. Redeploy or restart because only `integrations/**` changed.
5. Expose secrets in UI, logs, API responses, or screenshots.

Bad pattern:

```js
import { handler as runGmail } from '../../integrations/gmail-priority/src/handler.js';

app.post('/run-gmail', async (req, res) => {
  await runGmail(req.body);
  res.json({ ok: true });
});
```

Required pattern:

```js
app.post('/run-gmail', async (req, res) => {
  const job = await createIntegrationJob('gmail-priority', req.body);
  await enqueueIntegrationJob('gmail-priority', job);
  res.json({ status: 'queued', jobId: job.id });
});
```

## Independent Worker Rules

Every integration must run as an independent worker.

Each integration must have:

1. Its own handler.
2. Its own tests.
3. Its own fixtures.
4. Its own manifest.
5. Its own environment variable definitions.
6. Its own queue when queue processing is used.
7. Its own DLQ when queue processing is used.
8. Its own logs.
9. Its own deployment target.
10. Its own deployment pipeline.
11. Its own rollback instructions.

Default runtime:

```text
Lambda
```

Use ECS/Fargate only when the integration:

1. May run longer than 15 minutes.
2. Needs browser automation, such as Puppeteer.
3. Has heavy native dependencies.
4. Needs long-running container behavior.
5. Needs custom OS/runtime behavior.
6. Processes very large imports where chunking is not practical.

## Queue, DLQ, and Job Status Rules

Use SQS as the default job boundary between the API and integration workers.

Each integration should have its own queue:

```text
sqs-gmail-priority
sqs-shopify-priority
sqs-salesforce-priority
sqs-whatsapp-priority
```

Each integration should have its own DLQ:

```text
dlq-gmail-priority
dlq-shopify-priority
dlq-salesforce-priority
dlq-whatsapp-priority
```

Every job must track:

1. Job ID.
2. Integration name.
3. Trigger type.
4. Status: `queued`, `running`, `success`, `failed`, `retrying`.
5. Created time.
6. Started time.
7. Finished time.
8. Error summary.
9. Retry count.
10. CloudWatch log reference when available.

Failed jobs must not crash the API/dashboard.

Failed jobs must be visible in the dashboard with a clear user-facing explanation.

## Scheduled Integration Rules

Scheduled integrations must use EventBridge Scheduler in AWS.

Preferred pattern:

```text
EventBridge Scheduler
  -> SQS queue for integration
  -> Lambda/Fargate worker
```

Long scheduled jobs must be split into chunks with checkpoints when possible.

If a job cannot complete inside the Lambda 15-minute limit, use one of these patterns:

1. Chunked Lambda jobs with cursor/checkpoint.
2. Step Functions for multi-step workflows.
3. ECS/Fargate scheduled task for long/heavy processing.

Every scheduled integration must also support manual run for testing.

## Deployment Pipeline Rules

Use one repo and many independent pipelines.

There must not be one monolithic pipeline that deploys the whole repo.

A push to `master` must deploy only the service whose files changed.

Required pipeline pattern:

```text
Pipeline: api-dashboard
Watches:
- apps/api/**
- packages/shared/**
- infra/aws/api/**
- buildspec-api-eb.yml

Deploys:
- Elastic Beanstalk API/dashboard app

Must NOT watch:
- integrations/**
```

Each integration must have its own pipeline.

Example:

```text
Pipeline: integration-gmail-priority
Watches:
- integrations/gmail-priority/**
- packages/shared/**
- infra/aws/integrations/**
- buildspec-lambda-integration.yml

Deploys:
- gmail-priority Lambda
- gmail-priority SQS queue if needed
- gmail-priority DLQ if needed
- gmail-priority EventBridge schedule if needed
```

Required behavior:

```text
Change only integrations/gmail-priority/**
  -> only integration-gmail-priority pipeline runs
  -> API/dashboard pipeline does not run
  -> Elastic Beanstalk app does not restart
```

```text
Change only apps/api/**
  -> only api-dashboard pipeline runs
```

```text
Change packages/shared/**
  -> deploy all dependent services or use an explicit dependency mapping
```

## Required AWS Services

Use these AWS services unless there is a documented reason not to:

1. Elastic Beanstalk or ECS for the API/dashboard.
2. Lambda for normal integrations.
3. ECS/Fargate for long-running/heavy integrations.
4. SQS per integration.
5. DLQ per integration.
6. EventBridge Scheduler for schedules.
7. CloudWatch Logs per integration.
8. Secrets Manager or SSM Parameter Store for credentials.
9. CodePipeline with path-based triggers.
10. CodeBuild for build/test/deploy steps.
11. IAM roles with least privilege.

## Required AWS Scripts

The repository should include reusable AWS CLI scripts/templates:

```text
infra/aws/scripts/bootstrap.sh
infra/aws/scripts/create-eb-api.sh
infra/aws/scripts/create-sqs-for-integration.sh
infra/aws/scripts/create-lambda-integration.sh
infra/aws/scripts/create-fargate-integration.sh
infra/aws/scripts/create-eventbridge-schedule-for-integration.sh
infra/aws/scripts/create-codeconnection.sh
infra/aws/scripts/create-pipeline-api.sh
infra/aws/scripts/create-pipeline-integration.sh
infra/aws/scripts/create-new-integration-pipeline.sh
```

`create-new-integration-pipeline.sh` should accept:

1. Integration name.
2. Runtime type: `lambda` or `fargate`.
3. Branch name, default `master`.
4. GitHub owner.
5. GitHub repo.
6. CodeConnection ARN.
7. AWS region.

Example:

```bash
./infra/aws/scripts/create-new-integration-pipeline.sh \
  --integration bellboy-priority \
  --runtime lambda \
  --branch master
```

## CloudWatch Logging Rules

Every Lambda or ECS/Fargate integration must write logs to CloudWatch.

Each integration must have a separate log group or clearly identifiable log stream.

Recommended log groups:

```text
/aws/lambda/gmail-priority
/aws/lambda/shopify-priority
/aws/lambda/salesforce-priority
/aws/lambda/whatsapp-priority
```

Set log retention explicitly.

Recommended defaults:

```text
development: 7-14 days
production: 30-90 days
critical audit logs: export or archive separately if needed
```

Logs must be structured and searchable by:

1. Integration name.
2. Job ID.
3. Trigger type.
4. Direction.
5. Status.
6. External request ID.
7. Error code.
8. Provider name.

Logs must show safe summaries of data sent and received.

Logs must not show secrets, authorization headers, tokens, API keys, passwords, refresh tokens, private keys, full credit card numbers, or unnecessary sensitive personal information.

## UI/UX Rules for Settings, Secrets, and Save Feedback

Every integration settings screen must include:

1. Clear title.
2. Short explanation of what the integration does.
3. Required credential fields.
4. Helper text for each credential.
5. Link or instruction explaining where to get each credential.
6. Test connection button.
7. Test integration flow button.
8. Save button.
9. Clear save success message.
10. Clear error message.
11. Last successful test timestamp.
12. Last run status.
13. Link to job logs/status.

Secret fields must behave as follows:

1. Secrets must be masked.
2. Existing saved secrets must not display as empty fields.
3. Saved secrets should display a placeholder such as `•••••••• saved`.
4. If the user enters a new secret, it replaces the old secret only after Save.
5. If the user leaves the secret placeholder unchanged, the old secret remains.
6. Never return real secret values from the backend to the frontend.
7. Never print secret values to browser console or server logs.

Every save operation must show one of these clear outcomes:

```text
Saved successfully.
No changes to save.
Save failed: <clear reason>.
Connection test succeeded.
Connection test failed: <clear reason>.
```


## Mandatory Integration Delivery Gate

Before creating or modifying any integration, Codex must review the integration checklist/questions in this file and confirm that the implementation answers them. If required details are missing, ask focused questions before building.

Every integration change must include:

1. An integration contract review.
2. A UI/UX-focused agent or review step.
3. A log-review agent or review step.
4. Safe credential handling review.
5. Local validation with `npm run validate:integrations`.

If a separate agent tool is not available, Codex must perform the UI/UX and log-review steps directly and report the result.

The UI/UX review must verify:

* Every screen is understandable to a non-technical user.
* Every field has a clear label and helper text where needed.
* Every action gives clear feedback.
* Every save clearly shows success.
* Errors are clear and helpful.
* Passwords, tokens, secrets, API keys, and sensitive values are masked.
* Saved secret fields never appear blank in a way that suggests the value was deleted; show a saved placeholder such as `•••••••• saved`.
* Contextual help exists for credentials, webhook URLs, callback URLs, schedules, and test buttons.
* Every integration has clear test controls for connection testing and flow testing.

The log-review step must verify:

* Each important process step creates a clear structured log.
* Logs show the data-flow direction using phrases such as `Received from WhatsApp`, `Sent to Priority`, `Received from Priority`, or `Sent to Salesforce`.
* Logs include integration name, job ID, trigger type, start time, end time, status, request payload summary, response payload summary, and safe error message when failed.
* API failures identify the failed API, endpoint/action, HTTP status code when available, response body when safe, and a plain-language explanation.
* Logs never expose secrets, passwords, tokens, API keys, refresh tokens, authorization headers, or sensitive personal information.
* Sensitive values are masked or redacted, for example `Authorization: Bearer ***REDACTED***`.
* CloudWatch logs are separated per integration with a dedicated log group or clearly identifiable log stream.
* The dashboard shows simple user-facing job status/logs while CloudWatch keeps detailed technical logs.

Every `integration.js` must define metadata that supports this review gate:

```js
logging: {
  direction: 'INBOUND', // INBOUND, OUTBOUND, or BIDIRECTIONAL
  reviewRequired: true,
  cloudWatchLogGroup: 'integration-provider-purpose',
  steps: ['Received from Provider', 'Sent to Target'],
}
```

The main API/dashboard must not directly execute integration logic. Each integration must run independently through its own worker, queue, logs, and deployment pipeline. Adding or changing an integration must not redeploy or restart the main API/dashboard app.

## Main Goal

The automation app should be built as a generic integration platform.

It should support:

* REST APIs
* GraphQL APIs
* SOAP APIs
* Webhooks
* OAuth2
* API keys
* Bearer tokens
* HMAC signatures
* Basic authentication
* Database connections
* SQL Server connections
* ODBC connections
* SFTP/FTP file exchange
* Email protocols
* Queue/message systems
* Scheduled sync jobs
* Manual test runs
* Dummy/mock data mode
* Clear logging and error handling

## Core Integration Rule

Whenever the user asks to connect to a system, first identify the connection method.

Possible connection methods:

1. REST API
2. GraphQL API
3. SOAP API
4. OData API
5. Webhook receive
6. Webhook send
7. SQL direct connection
8. SQL Server native driver
9. ODBC connection
10. JDBC connection, if relevant through a bridge/service
11. OLE DB, if required by legacy systems
12. ADO.NET, if relevant to a .NET helper/service
13. SFTP file exchange
14. FTP/FTPS file exchange
15. SMB/network folder file exchange
16. CSV import/export
17. Excel import/export
18. XML import/export
19. JSON file import/export
20. EDI
21. Message queue
22. SMTP email sending
23. IMAP email reading
24. POP3 email reading
25. WebSocket
26. gRPC
27. MQTT
28. Kafka
29. RabbitMQ
30. Azure Service Bus
31. AWS SQS/SNS
32. Google Pub/Sub
33. LDAP/Active Directory
34. SCIM user provisioning
35. CalDAV/CardDAV
36. OPC UA, for industrial integrations
37. HL7/FHIR, for healthcare integrations

## Common Systems the App Should Be Ready to Integrate With

The app should be designed so new connectors can be added for systems such as:

### Email and Workspace

* Gmail
* Google Workspace
* Microsoft 365
* Outlook
* Exchange Online
* Microsoft Graph
* Google Drive
* OneDrive
* SharePoint
* Dropbox
* Box

### Messaging and Communication

* WhatsApp Business API
* Twilio
* Slack
* Microsoft Teams
* Telegram Bot API
* SendGrid
* Mailchimp
* Brevo
* SMTP servers
* IMAP mailboxes

### CRM

* Salesforce
* HubSpot
* Zoho CRM
* Microsoft Dynamics 365
* Monday.com CRM
* Pipedrive
* Freshsales

### ERP

* Priority ERP
* SAP Business One
* SAP S/4HANA
* Oracle NetSuite
* Oracle Fusion ERP
* Microsoft Dynamics 365 Business Central
* Odoo
* Sage
* Infor
* Epicor
* QuickBooks
* Xero

### eCommerce and Marketplaces

* Shopify
* WooCommerce
* Magento / Adobe Commerce
* BigCommerce
* Wix
* Squarespace
* Amazon Seller Central
* eBay
* Etsy

### Project and Work Management

* Monday.com
* ClickUp
* Asana
* Jira
* Trello
* Notion
* Airtable
* Smartsheet
* Linear

### Payments

* Stripe
* PayPal
* Square
* Adyen
* Braintree
* Checkout.com
* Tranzila
* Meshulam
* Cardcom
* Pelecard
* YaadPay

### Databases and Data Sources

* Microsoft SQL Server
* SQL Server via ODBC
* SQL Server via native Node.js driver
* PostgreSQL
* MySQL
* MariaDB
* Oracle Database
* MongoDB
* SQLite
* Redis
* Snowflake
* BigQuery
* Redshift
* Databricks
* Firebird
* Access Database via ODBC
* Excel files
* CSV files
* XML files
* JSON files

### Cloud and Infrastructure

* AWS
* Azure
* Google Cloud
* Firebase
* Supabase
* Cloudflare
* Azure Blob Storage
* AWS S3
* Google Cloud Storage

### Development and DevOps

* GitHub
* GitLab
* Bitbucket
* Azure DevOps
* Jenkins
* Docker
* Kubernetes
* Vercel
* Netlify

### AI Services

* OpenAI API
* Anthropic API
* Google Gemini API
* Azure OpenAI
* Hugging Face

## Required Connector Structure

For new work, prefer the monorepo service structure described above:

```text
apps/api
integrations/<integration-name>
packages/shared
infra/aws
docs
```

Every new integration should follow this structure unless the existing project has not yet been refactored:

```text
integrations/
  provider-purpose/
    src/
      handler.js
      manifest.js
      provider.client.js
      provider.service.js
      provider.mapper.js
      provider.auth.js
    fixtures/
      sample-job.json
      sample-request.json
      sample-response.json
    tests/
      provider.test.js
    README.md
    package.json
```

Each integration must expose a standard handler interface:

```js
export async function handler(job, context) {
  // run integration
}
```

Each integration must include a manifest file:

```text
integrations/<integration-name>/src/manifest.js
```

The manifest must define:

1. Integration name.
2. Display name.
3. Direction.
4. Trigger types.
5. Runtime: `lambda` or `fargate`.
6. Credential definitions.
7. UI helper text.
8. Logging steps.
9. Queue/DLQ requirement.
10. Schedule requirement.
11. Test mode support.
12. Deployment pipeline requirement.

Legacy structure is allowed only when the current project has not yet been migrated:

```text
src/
  integrations/
    providerName/
      providerName.config.js
      providerName.auth.js
      providerName.client.js
      providerName.service.js
      providerName.routes.js
      providerName.test.js
scripts/
  providerName-get-token.js
  providerName-test-connection.js
data/
  providerName-token.json
docs/
  providerName-setup.md
```

If the legacy structure is used, Codex must still enforce these architecture rules:

1. The API/dashboard must not directly execute integration logic.
2. Integration execution must happen through a queue and independent worker.
3. Adding or changing an integration must not redeploy or restart the main API/dashboard app.
4. Every integration must have its own logs, tests, manifest, credentials, and deployment path.

Use the actual provider name, for example:

```text
integrations/gmail-priority/
integrations/ms365-priority/
integrations/shopify-priority/
integrations/monday-priority/
integrations/sqlserver-priority/
integrations/priority-shopify/
```

## Environment Variables

Every connector must use environment variables.

Never hardcode:

* API tokens
* Client IDs
* Client secrets
* Refresh tokens
* Access tokens
* Passwords
* Database connection strings
* Tenant IDs
* Shop domains
* Webhook secrets
* Private keys

Each integration must update `.env.example`.

Example:

```env
PROVIDER_API_URL=
PROVIDER_API_KEY=
PROVIDER_CLIENT_ID=
PROVIDER_CLIENT_SECRET=
PROVIDER_REDIRECT_URI=
PROVIDER_WEBHOOK_SECRET=
```

## Security Rules

1. Never print secrets in logs.
2. Never return tokens in API responses.
3. Never commit `.env`.
4. Never commit token files.
5. Add local token/data files to `.gitignore`.
6. Use least-privilege scopes.
7. Validate webhook signatures when supported.
8. Validate input data before sending it to external APIs.
9. Handle expired tokens safely.
10. Keep production token storage separate from local development token storage.

## Authentication Handling

Before building a connector, identify the authentication method.

Supported authentication patterns:

### API Key

Use when the provider gives a static API key.

Required:

* Store key in `.env`
* Add test connection function
* Never log the key

### Bearer Token

Use when the provider gives an access token.

Required:

* Store token in `.env` or secure token storage
* Add authorization header
* Handle 401 errors clearly

### OAuth2 Authorization Code

Use when the app connects on behalf of a user.

Required:

* Auth URL generator
* Callback route
* Token exchange
* Refresh token handling
* Local token helper script
* Token storage abstraction

### OAuth2 Client Credentials

Use for server-to-server integrations.

Required:

* Client ID
* Client secret
* Tenant/account ID if needed
* Token cache
* Auto-refresh before expiry

### Basic Authentication

Use only when required by the provider.

Required:

* Store username/password in `.env`
* Never log credentials
* Prefer token/OAuth if available

### HMAC / Signed Requests

Use when provider requires signed requests or webhook validation.

Required:

* Store secret in `.env`
* Implement signature generation or verification
* Reject invalid webhook signatures

## Token Helper Requirement

If OAuth is required, create a helper script.

Example:

```text
scripts/provider-get-token.js
```

The script should:

1. Load `.env`.
2. Validate required env vars.
3. Generate the authorization URL.
4. Print the URL clearly.
5. Optionally open the browser.
6. Receive callback or allow pasting authorization code.
7. Exchange authorization code for tokens.
8. Save tokens locally for development.
9. Add token path to `.gitignore`.
10. Print success without exposing token values.

Example local token path:

```text
data/provider-token.json
```

Production code should be structured so this can later be replaced by database or secret-manager storage.

## SQL Server Integration Rules

When the user asks to connect to SQL Server, support both native SQL Server and ODBC approaches.

### Preferred Node.js Native Driver

Use a native Node.js SQL Server driver when possible, for example:

```text
mssql
```

Required env vars:

```env
SQLSERVER_HOST=
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=
SQLSERVER_USER=
SQLSERVER_PASSWORD=
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=false
```

Required functionality:

* Create connection pool
* Test connection
* Run parameterized queries
* Avoid SQL injection
* Handle connection timeout
* Handle login failure
* Handle certificate/encryption issues
* Support stored procedure execution if needed

### SQL Server via ODBC

Use ODBC when:

* The customer already has an ODBC DSN
* The ERP exposes data through ODBC
* A legacy system only supports ODBC
* The database driver is only available through ODBC
* Priority/ERP/database access requires ODBC

Possible env vars:

```env
ODBC_DSN=
ODBC_USER=
ODBC_PASSWORD=
ODBC_CONNECTION_STRING=
```

Required functionality:

* Support DSN-based connection
* Support full connection-string connection
* Add test connection script
* Use parameterized queries where supported
* Document required ODBC driver installation
* Document 32-bit vs 64-bit driver requirements
* Handle missing DSN error clearly
* Handle driver not installed error clearly

### SQL Query Safety

For all SQL connectors:

1. Never concatenate user input into SQL.
2. Always use parameterized queries.
3. Separate read queries from write queries.
4. Log query names, not sensitive data.
5. Add timeout handling.
6. Return clear errors.
7. Add a safe test query, for example:

```sql
SELECT 1 AS test
```

## Database Integration Rules

For any database:

1. Create a dedicated database client module.
2. Use connection pooling when appropriate.
3. Store connection details in `.env`.
4. Add a test connection command.
5. Use parameterized queries.
6. Handle connection timeouts.
7. Handle authentication errors.
8. Handle network/firewall errors.
9. Never expose full connection strings in logs.
10. Document driver installation.

Common database drivers may include:

```text
mssql
odbc
pg
mysql2
oracledb
mongodb
sqlite3
redis
```

## REST API Integration Rules

For REST APIs:

1. Create a reusable HTTP client.
2. Store base URL in `.env`.
3. Store auth values in `.env` or token storage.
4. Add timeout handling.
5. Add retry handling where safe.
6. Handle pagination.
7. Handle rate limits.
8. Normalize errors.
9. Add request/response mapping.
10. Never log secrets or full sensitive payloads.

## GraphQL Integration Rules

For GraphQL APIs:

1. Create a GraphQL client helper.
2. Store endpoint and token in `.env`.
3. Keep queries/mutations organized.
4. Use variables, not string concatenation.
5. Handle GraphQL errors and HTTP errors separately.
6. Add test query.
7. Document required IDs such as board ID, shop ID, customer ID, etc.

## SOAP / XML Integration Rules

For SOAP or XML APIs:

1. Store WSDL URL or endpoint in `.env`.
2. Create a SOAP client/helper.
3. Keep XML building/parsing isolated.
4. Validate required fields.
5. Log request IDs, not sensitive XML.
6. Handle namespaces carefully.
7. Add sample request and response files for testing.
8. Add mock mode using sample XML.

## OData Integration Rules

For OData APIs:

1. Store base OData URL in `.env`.
2. Support authentication as required.
3. Use query parameters safely.
4. Handle `$filter`, `$select`, `$expand`, `$top`, `$skip`.
5. Handle pagination.
6. Add test entity request.
7. Document entity names and field mappings.

## Webhook Integration Rules

For inbound webhooks:

1. Create a provider-specific webhook route.
2. Verify signature if supported.
3. Store webhook secret in `.env`.
4. Return fast HTTP response.
5. Process heavy work asynchronously where possible.
6. Log webhook event ID.
7. Prevent duplicate processing.
8. Add local dummy webhook test.
9. Add sample payloads.
10. Document how to configure the webhook in the provider system.

For outbound webhooks:

1. Store target URL in `.env`.
2. Sign the request if needed.
3. Add retry strategy.
4. Log delivery attempts.
5. Never send secrets unintentionally.

## File-Based Integration Rules

For SFTP, FTP, network folders, CSV, Excel, XML, and JSON:

1. Create a file connector module.
2. Store credentials and paths in `.env`.
3. Support inbound and outbound folders.
4. Support archive folder.
5. Support error folder.
6. Avoid processing the same file twice.
7. Validate file format before import.
8. Add sample files.
9. Add dummy/test mode.
10. Log processed file names and results.
11. Do not log sensitive file contents.

## Scheduling Rules

For scheduled integrations:

1. Each integration should support manual run.
2. Each integration should support scheduled run if needed.
3. Store schedule configuration in app settings or database.
4. Prevent overlapping runs.
5. Record run history.
6. Record start time, end time, status, and error.
7. Support retry when safe.
8. Support dry-run mode when useful.

## Manual Testing Rules

Every connector must include at least one easy test method.

Examples:

```bash
npm run test:gmail
npm run test:ms365
npm run test:shopify
npm run test:monday
npm run test:sqlserver
npm run test:odbc
npm run test:provider
```

or HTTP endpoints:

```text
GET /api/integrations/provider/test-connection
GET /api/integrations/provider/sample-data
POST /api/integrations/provider/run-test
```

The test should return a safe summary, not raw secrets or tokens.

## Dummy / Mock Mode

Every integration should support mock mode when practical.

Mock mode should allow testing without calling the real external system.

Example env var:

```env
PROVIDER_USE_MOCK=true
```

Mock mode may use:

```text
samples/provider/sample-request.json
samples/provider/sample-response.json
samples/provider/sample-webhook.json
samples/provider/sample-file.csv
```

## Logging and Run History

Every integration run should log:

* Integration name
* Direction
* Trigger type
* Start time
* End time
* Status
* Number of records read
* Number of records created
* Number of records updated
* Number of records skipped
* Number of errors
* Safe error message
* External request ID if available

Do not log:

* Access tokens
* Refresh tokens
* Client secrets
* Passwords
* Full credit card numbers
* Full sensitive personal data
* Full private email bodies unless explicitly required

## Integration Direction

Every integration must define its direction:

```text
INBOUND  = external system to this app / ERP
OUTBOUND = this app / ERP to external system
BIDIRECTIONAL = sync in both directions
```

Each direction should have separate mapping and error handling.

## Data Mapping Rules

For every integration, define mapping clearly.

Required mapping documentation:

1. Source system
2. Target system
3. Source object
4. Target object
5. Source field
6. Target field
7. Required/optional
8. Transformation rule
9. Default value
10. Validation rule

Example:

```text
Shopify Order → Priority Sales Order
Gmail Message → Internal Ticket
Monday Item → Priority Project Task
SQL Row → API Payload
CSV File Row → ERP Customer
```

## Standard Provider-Specific Notes

### Gmail / Google Workspace

Use:

```text
googleapis
```

Required:

* OAuth2
* Refresh token helper
* Least-privilege scopes
* Gmail API / Drive API / Calendar API as needed
* No ChatGPT connector dependency

### Microsoft 365

Use:

```text
Microsoft Graph API
@azure/msal-node
```

Required:

* Tenant ID
* Client ID
* Client secret
* Delegated or application permissions
* Clear permission documentation
* Token helper or client-credentials helper

### Shopify

Use:

```text
Shopify Admin API
GraphQL Admin API preferred where practical
REST API if simpler for the task
```

Required:

* Shop domain
* Admin access token or OAuth app flow
* Webhook HMAC verification
* Clear scopes
* Product/order/customer/inventory helpers as needed

### Monday.com

Use:

```text
Monday GraphQL API
```

Required:

* API token
* Board ID config
* Column ID config
* Helper to list boards/columns
* No hardcoded IDs unless explicitly requested

### Priority ERP

Support available connection methods depending on customer environment:

* Priority REST API
* Priority OData
* Priority Web SDK
* Priority direct database access only if allowed
* Priority ODBC only if allowed and available
* File-based import/export if required

Required:

* Company/environment config
* API URL
* Credentials/token
* Form/entity mapping
* Clear error handling
* Safe testing against test company/environment where possible

## New API Integration Checklist

When the user asks for a new API, follow this checklist:

1. Identify provider.
2. Identify auth method.
3. Identify base URL.
4. Identify required endpoints.
5. Identify required objects.
6. Identify source and target mapping.
7. Identify sync direction.
8. Identify trigger:

   * Manual
   * Scheduled
   * Webhook
   * File polling
9. Identify whether dummy/mock mode is needed.
10. Identify whether token helper is needed.
11. Identify required env vars.
12. Add `.env.example`.
13. Add `.gitignore` entries.
14. Add service/helper files.
15. Add test connection.
16. Add README/docs.
17. Add safe logging.
18. Add error handling.
19. Run syntax checks/tests.
20. Report changed files.

## Required Output After Codex Changes Code

After implementing any connector, Codex must report:

1. Files changed.
2. Packages installed.
3. Env vars added.
4. How to configure credentials.
5. How to get tokens, if relevant.
6. How to test connection.
7. How to run with mock data.
8. Known limitations.
9. Security notes.
10. Next recommended step.
11. Integration checklist answers.
12. UI/UX review result.
13. Log-review result.

## Required Acceptance Checklist Before Completion

Before Codex reports that an integration task is complete, it must verify and report:

1. The integration checklist was reviewed.
2. All required questions were answered or documented as placeholders.
3. The integration contract is clear.
4. UI/UX review was completed.
5. Log-review was completed.
6. Credential/security review was completed.
7. Deployment isolation review was completed.
8. The API does not import or run integration logic directly.
9. The integration has its own handler and manifest.
10. The integration has tests and fixtures.
11. Mock/dummy mode exists when practical.
12. Secrets are masked in UI and never exposed by API.
13. Save success/failure feedback is clear.
14. Logs show sent data and received data using safe summaries.
15. Logs redact secrets and sensitive values.
16. CloudWatch logging is separated per integration.
17. SQS and DLQ exist when queue processing is used.
18. EventBridge schedule exists when scheduling is used.
19. The integration has an independent pipeline.
20. `integrations/**` changes do not trigger the API/dashboard pipeline.
21. Local validation command was run or a clear reason was documented.
22. Changed files are listed.
23. Environment variables are listed.
24. Token/helper steps are documented.
25. How to test locally is documented.
26. How to test in AWS is documented.
27. Known limitations are documented.
28. Next recommended step is documented.

## Codex Final Report Format

After every integration task, Codex must report in this format:

```text
Summary:
- ...

Files changed:
- ...

Packages installed:
- ...

Environment variables added:
- ...

Credential setup:
- ...

Token/helper instructions:
- ...

Local test commands:
- ...

Mock/dummy mode:
- ...

AWS resources:
- ...

Pipeline behavior:
- ...

UI/UX review:
- Passed / Failed
- Notes:

Logging review:
- Passed / Failed
- Notes:

Security review:
- Passed / Failed
- Notes:

Deployment isolation review:
- Passed / Failed
- Notes:

Integration checklist answers:
1. Provider:
2. Auth method:
3. Base URL:
4. Required endpoints:
5. Objects/entities:
6. Mapping:
7. Direction:
8. Trigger:
9. Mock mode:
10. Token helper:
11. Env vars:
12. Tests:
13. Logging:
14. Error handling:
15. Limitations:

Next recommended step:
- ...
```


## Important Final Rule

When unsure about a provider-specific API, do not invent details.

Instead:

1. Build the connector in a configurable way.
2. Use official SDKs or standard protocols.
3. Leave placeholders where customer-specific values are required.
4. Document exactly what the user must provide.
5. Keep the code modular so the provider details can be corrected easily.


Architecture rule:
The main API process must never directly run integration code.
All integration execution must happen through a queue and an independent worker.
If an integration fails, the failure must be isolated to that integration.
