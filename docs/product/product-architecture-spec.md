# Product Architecture Specification

User-Based Automation Platform - Node.js + AWS

## 0. Important Instructions for the AI Coding Agent

You are building a real application, not a demo only.

Do not hallucinate.
Do not invent missing requirements.
Do not silently change the architecture.
Do not hardcode secrets.
Do not store real passwords or API tokens in code.
Do not dynamically load code directly from URL parameters.
Do not allow users to upload or execute arbitrary code from the UI in the MVP.
Do not skip testing infrastructure.

Build the system incrementally.

Before implementing a major architectural change, explain the reason and the impact.

The first version should be minimal but designed correctly, with strong testing support from the beginning.

---

## 1. Product Goal

Build a Node.js automation platform.

The system allows each user to own multiple integrations.

Each integration is a custom automation process with its own:

- name
- description
- type
- code folder
- `integration.js` definition file
- `handler.js` execution file
- credentials/configuration fields
- executions
- logs
- testing tools

The platform supports only two real integration types:

1. `webhook` — the integration listens for an HTTP request from a third-party system.
2. `scheduled` — the integration runs automatically based on a schedule.

Both integration types must also support manual execution from the dashboard for testing.

The main idea:

```text
User
 └── Integration
      ├── integration.js
      ├── handler.js
      ├── credentials
      ├── executions
      └── logs
```

The platform is not a generic AWS control panel.
The platform is an automation runner and management dashboard.

AWS is only the hosting, scaling, queue, secrets, logging, authentication, and scheduling infrastructure.

---

## 2. Core Business Concept

A user has many integrations.

Each integration belongs to one user.

Each integration has its own code.

Example:

```text
user_001
 ├── whatsapp-order
 │    ├── integration.js
 │    └── handler.js
 │
 └── stock-sync
      ├── integration.js
      └── handler.js

user_002
 └── whatsapp-order
      ├── integration.js
      └── handler.js
```

Even if two users both have a WhatsApp integration, the business logic may be different.

Therefore:

```text
user_001 / whatsapp-order / handler.js
```

can behave differently from:

```text
user_002 / whatsapp-order / handler.js
```

The core platform must know how to:

- identify the user
- identify the integration
- validate access
- load the registered integration definition
- load the registered integration handler
- run the handler
- inject credentials
- inject logger
- inject connectors
- save execution status
- save logs
- show logs only to the correct user

---

## 3. MVP Scope

The MVP must include:

- Node.js backend
- user login
- admin login
- user management
- integration management per user
- webhook integrations
- scheduled integrations
- manual run for both types
- `integration.js` definition support
- `handler.js` execution support
- dynamic credential form based on `integration.js`
- credential saving per user + integration
- secret handling
- execution history
- logs per user
- logs per integration
- strong testing tools
- local development setup
- AWS deployment plan

Not included in MVP:

- visual drag-and-drop automation builder
- user-uploaded code from dashboard
- marketplace
- billing
- multi-tenant SaaS billing
- AI workflow designer
- full plugin marketplace
- customer self-registration
- arbitrary code sandbox
- complex approval workflows

---

## 4. Recommended Technology Stack

### Backend

- Node.js
- Express.js
- TypeScript preferred, but JavaScript is acceptable for faster MVP
- PostgreSQL
- Prisma ORM or another clear database layer
- JWT-based authentication
- AWS SDK for JavaScript v3

### Frontend

Simple dashboard.

Recommended:

- React
- Vite
- Tailwind CSS
- Basic admin/user dashboard

If speed is more important, a simple server-rendered UI is acceptable for MVP, but React is preferred.

### Local development

- Windows
- VS Code
- Node.js LTS
- Git
- PostgreSQL local or Docker PostgreSQL
- Postman / Insomnia
- optional LocalStack

### AWS production

- Elastic Beanstalk
- RDS PostgreSQL
- SQS
- EventBridge Scheduler
- Secrets Manager
- Cognito
- CloudWatch Logs
- IAM Roles
- GitHub Actions or AWS CodePipeline

---

## 5. Main Objects

### 5.1 User

Represents the person/customer using the platform.

Fields:

```text
id
email
name
role
status
createdAt
updatedAt
```

Roles:

```text
admin
user
viewer
```

Relationships:

```text
User has many Integrations
User has many Executions
User has many Logs
```

Access rule:

A normal user can only access their own integrations, executions, credentials, and logs.

An admin can manage all users and integrations.

---

### 5.2 Integration

Represents one automation owned by a user.

Fields:

```text
id
userId
name
description
slug
type: webhook | scheduled
status: active | inactive
codeFolder
definitionFile
handlerFile
manualRunEnabled
createdAt
updatedAt
```

Relationships:

```text
Integration belongs to User
Integration has many Credentials
Integration has many Executions
Integration has many Logs
Integration may have WebhookSettings
Integration may have ScheduleSettings
```

Example:

```json
{
  "id": "int_001",
  "userId": "user_001",
  "name": "WhatsApp Order Notification",
  "description": "Receives order webhook and sends WhatsApp message",
  "slug": "whatsapp-order",
  "type": "webhook",
  "status": "active",
  "codeFolder": "src/integrations/user_001/whatsapp-order",
  "definitionFile": "integration.js",
  "handlerFile": "handler.js",
  "manualRunEnabled": true
}
```

---

### 5.3 Integration Definition File

Each integration folder must include:

```text
integration.js
```

This file declares the integration metadata and required fields.

It must define:

- name
- description
- type
- manualRun
- credentials
- testing options
- test payloads
- optional webhook settings
- optional schedule defaults

Important:

`integration.js` must not store real credential values.

It only defines the fields required by the integration.

Example:

```js
module.exports = {
  name: "WhatsApp Order Notification",
  description: "Receives order data and sends a WhatsApp message.",
  type: "webhook",
  manualRun: true,

  webhook: {
    method: "POST",
    requiresToken: true
  },

  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: "dry_run"
  },

  credentials: [
    {
      key: "WHATSAPP_TOKEN",
      label: "WhatsApp Token",
      type: "secret",
      required: true,
      helper: "Paste the WhatsApp API token from the provider dashboard. This value will be stored securely and will not be visible after saving.",
      placeholder: "Bearer token",
      validation: {
        minLength: 10
      }
    },
    {
      key: "WHATSAPP_API_URL",
      label: "WhatsApp API URL",
      type: "url",
      required: true,
      helper: "The API endpoint used to send WhatsApp messages.",
      placeholder: "https://api.example.com/messages"
    },
    {
      key: "DEFAULT_COUNTRY_CODE",
      label: "Default Country Code",
      type: "text",
      required: false,
      helper: "Used if the incoming phone number does not include a country code.",
      defaultValue: "972"
    }
  ],

  testPayloads: [
    {
      name: "Valid order payload",
      description: "Normal order webhook payload.",
      payload: {
        order: {
          number: "10045"
        },
        customer: {
          name: "David Cohen",
          phone: "972501234567"
        }
      }
    },
    {
      name: "Missing phone payload",
      description: "Used to test validation errors.",
      payload: {
        order: {
          number: "10046"
        },
        customer: {
          name: "David Cohen"
        }
      }
    }
  ]
};
```

---

### 5.4 Credential Field Schema

Each credential/configuration field in `integration.js` should support:

```text
key
label
type
required
helper
placeholder
defaultValue
options
validation
isSecret
```

Supported field types:

```text
text
textarea
number
boolean
select
secret
password
url
email
json
date
```

Examples:

```js
{
  key: "ANTHROPIC_API_KEY",
  label: "Anthropic API Key",
  type: "secret",
  required: true,
  helper: "Create an API key in your Anthropic dashboard and paste it here. The key will be stored securely and will not be visible again.",
  placeholder: "sk-ant-..."
}
```

```js
{
  key: "MODEL",
  label: "Model",
  type: "select",
  required: true,
  helper: "Choose the model used by this integration.",
  defaultValue: "claude-sonnet",
  options: [
    { label: "Claude Sonnet", value: "claude-sonnet" },
    { label: "Claude Haiku", value: "claude-haiku" }
  ]
}
```

---

### 5.5 Handler File

Each integration folder must include:

```text
handler.js
```

The handler contains the actual custom logic for the user/integration.

Every handler must export the same contract:

```js
module.exports = {
  async execute({ payload, credentials, user, integration, logger, connectors, executionMode }) {
    logger.info("Integration started");

    // Custom integration logic here

    return {
      success: true,
      message: "Integration completed"
    };
  }
};
```

The core engine must always call the handler this way:

```js
await handler.execute({
  payload,
  credentials,
  user,
  integration,
  logger,
  connectors,
  executionMode
});
```

Handlers must not access secrets directly from environment variables.
Handlers must receive credentials from the platform.

Handlers must not write logs directly to database.
Handlers must use the injected `logger`.

Handlers must not call external APIs directly if a connector exists.
They should call injected connectors.

Example:

```js
await connectors.whatsapp.sendMessage({
  to: phone,
  message
});
```

instead of:

```js
await fetch("https://api.whatsapp-provider.com/send", options);
```

---

### 5.6 Credential

Stores the actual values entered by the user for a specific integration.

Fields:

```text
id
userId
integrationId
key
valueReference
type
isSecret
createdAt
updatedAt
```

Rules:

- Secret values are stored in AWS Secrets Manager in production.
- Secret values are not displayed after saving.
- Non-secret values can be stored in the database.
- The dashboard may show `******** saved` for secret fields.
- The user can overwrite a secret but cannot read the existing value.

---

### 5.7 Webhook Settings

Used only for webhook integrations.

Fields:

```text
id
integrationId
webhookUrl
secretTokenReference
allowedMethod
active
createdAt
updatedAt
```

Example endpoint:

```text
POST /webhooks/:userSlug/:integrationSlug
```

Flow:

```text
1. External system sends JSON to webhook URL.
2. Platform identifies user and integration.
3. Platform validates token/signature.
4. Platform saves incoming payload.
5. Platform creates execution.
6. Platform sends job to queue or runs directly in local mode.
7. Platform loads integration handler.
8. Platform injects credentials, logger, connectors, and payload.
9. Handler runs.
10. Platform saves result and logs.
```

---

### 5.8 Schedule Settings

Used only for scheduled integrations.

Fields:

```text
id
integrationId
cronExpression
timezone
active
lastRunAt
nextRunAt
createdAt
updatedAt
```

Example:

```text
0 2 * * * Asia/Jerusalem
```

Flow:

```text
1. Scheduler triggers integration.
2. Platform creates execution.
3. Platform sends job to queue or runs directly in local mode.
4. Platform loads integration handler.
5. Platform injects credentials, logger, connectors, and optional payload.
6. Handler runs.
7. Platform saves result and logs.
8. Platform updates lastRunAt and nextRunAt.
```

---

### 5.9 Execution

Represents one run of an integration.

Fields:

```text
id
userId
integrationId
triggerType: webhook | scheduled | manual
executionMode: live | test | dry_run | mock_input | mock_output | replay
status: pending | running | success | failed
startedAt
finishedAt
inputPayload
outputPayload
errorMessage
sourceExecutionId
createdAt
updatedAt
```

Every manual run, webhook run, schedule run, dry run, mock run, and replay must create an execution record.

---

### 5.10 Log

Represents one runtime log entry.

Fields:

```text
id
userId
integrationId
executionId
level: debug | info | warning | error
message
metadata
executionMode
isTest
createdAt
```

Rules:

- Logs must always belong to user + integration + execution.
- Users can see only their own logs.
- Admins can see all logs.
- Logs should be searchable/filterable by level, integration, execution, mode, and date.

---

## 6. Object Relationships

```text
User
 └── Integration
      ├── Integration Definition
      ├── Credentials
      ├── Webhook Settings
      ├── Schedule Settings
      └── Execution
            └── Logs
```

Database relationship summary:

```text
users.id = integrations.userId
users.id = executions.userId
users.id = logs.userId

integrations.id = credentials.integrationId
integrations.id = executions.integrationId
integrations.id = logs.integrationId

executions.id = logs.executionId
```

---

## 7. Project Folder Structure

Recommended:

```text
project-root/
│
├─ src/
│  ├─ app.js
│  ├─ server.js
│  │
│  ├─ core/
│  │  ├─ auth.js
│  │  ├─ permissions.js
│  │  ├─ integration-loader.js
│  │  ├─ execution-runner.js
│  │  ├─ webhook-runner.js
│  │  ├─ schedule-runner.js
│  │  ├─ manual-runner.js
│  │  ├─ execution-service.js
│  │  ├─ logger.js
│  │  ├─ secrets.js
│  │  ├─ queue.js
│  │  ├─ scheduler.js
│  │  └─ testing-runner.js
│  │
│  ├─ integrations/
│  │  ├─ user_001/
│  │  │  └─ whatsapp-order/
│  │  │     ├─ integration.js
│  │  │     └─ handler.js
│  │  │
│  │  ├─ user_001/
│  │  │  └─ stock-sync/
│  │  │     ├─ integration.js
│  │  │     └─ handler.js
│  │  │
│  │  └─ user_002/
│  │     └─ whatsapp-order/
│  │        ├─ integration.js
│  │        └─ handler.js
│  │
│  ├─ connectors/
│  │  ├─ whatsapp/
│  │  │  ├─ real.js
│  │  │  └─ mock.js
│  │  ├─ priority/
│  │  │  ├─ real.js
│  │  │  └─ mock.js
│  │  ├─ generic-rest/
│  │  │  ├─ real.js
│  │  │  └─ mock.js
│  │  └─ email/
│  │     ├─ real.js
│  │     └─ mock.js
│  │
│  ├─ routes/
│  │  ├─ auth-routes.js
│  │  ├─ admin-routes.js
│  │  ├─ integration-routes.js
│  │  ├─ webhook-routes.js
│  │  ├─ execution-routes.js
│  │  ├─ log-routes.js
│  │  └─ test-routes.js
│  │
│  ├─ db/
│  │  ├─ schema.js
│  │  ├─ migrations/
│  │  └─ seed.js
│  │
│  └─ utils/
│
├─ frontend/
│  └─ dashboard/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  └─ mocks/
│
├─ local-data/
│  ├─ secrets.local.json
│  └─ payloads/
│
├─ package.json
├─ .env.example
├─ .gitignore
├─ README.md
└─ SPEC.md
```

---

## 8. Core Application Flows

### 8.1 User Login

```text
1. User enters email/password.
2. Backend authenticates user.
3. Backend returns session/JWT.
4. Dashboard loads only integrations belonging to this user.
```

MVP local mode can use mock authentication.

Production should use Amazon Cognito.

---

### 8.2 Admin Creates User

```text
1. Admin opens Users page.
2. Admin creates new user.
3. System creates user record.
4. Optional: system creates user in Cognito.
5. Admin can assign integrations to the user.
```

---

### 8.3 Admin Creates Integration for User

```text
1. Admin selects user.
2. Admin creates integration.
3. Admin enters name, description, slug, type.
4. Admin assigns code folder.
5. System validates that integration.js and handler.js exist.
6. System reads integration.js.
7. System saves integration record.
8. Dashboard displays credential fields from integration.js.
```

---

### 8.4 User Configures Integration Credentials

```text
1. User opens integration page.
2. Backend loads integration.js definition.
3. Backend returns required credential fields.
4. Frontend dynamically renders fields.
5. User enters values.
6. Backend saves non-secret values in DB.
7. Backend saves secret values in Secrets Manager or local secret store.
8. Backend records audit log.
```

---

### 8.5 Webhook Execution

```text
1. Third-party sends POST request.
2. Backend receives request.
3. Backend identifies user + integration by URL.
4. Backend validates integration is active.
5. Backend validates token/signature.
6. Backend creates execution record.
7. Backend stores input payload.
8. Backend sends job to queue or runs directly in local mode.
9. Runner loads integration handler.
10. Runner loads credentials.
11. Runner injects logger, connectors, payload, user, integration.
12. Handler executes.
13. Runner saves output or error.
14. Runner saves logs.
```

---

### 8.6 Scheduled Execution

```text
1. Scheduler triggers integration by cron/rate.
2. Backend creates execution record.
3. Backend sends job to queue or runs directly in local mode.
4. Runner loads handler and credentials.
5. Handler executes.
6. Logs and result are saved.
```

---

### 8.7 Manual Run

All integrations must be manually runnable.

For webhook integrations:

```text
1. User opens integration page.
2. User clicks Run Test.
3. User selects sample payload or pastes JSON.
4. System runs the integration in test/dry_run/mock mode.
5. Logs and result are shown in dashboard.
```

For scheduled integrations:

```text
1. User opens integration page.
2. User clicks Run Now.
3. System runs the integration immediately.
4. User can choose live, dry_run, or mock mode depending on permissions.
```

---

## 9. Testing Requirements — Very Important

Testing must be designed as a first-class feature.

The system must make it easy to test every part of the chain separately.

### 9.1 Execution Modes

Supported modes:

```text
live
test
dry_run
mock_input
mock_output
replay
```

Meaning:

```text
live        = real execution, real payload, real external API calls
test        = dashboard-triggered test run
dry_run     = run logic but do not call external APIs
mock_input  = use saved dummy input instead of real webhook/API input
mock_output = simulate external API response instead of real API call
replay      = rerun a previous execution payload for debugging
```

Every execution must save its execution mode.

---

### 9.2 Test Webhook Without Third Party

The dashboard must allow webhook testing without waiting for the external system.

User/admin should be able to:

- open a webhook integration
- choose a sample payload from `integration.js`
- paste custom JSON
- set headers
- set query parameters
- run the webhook as test
- choose dry_run or mock_output mode
- see execution logs

Important rule:

The test webhook must use the same runner as the real webhook.

Do not build a separate fake test path that does not match production behavior.

---

### 9.3 Test Scheduled Integration Without Waiting

The dashboard must allow scheduled integrations to be tested immediately.

User/admin should be able to:

- click Run Now
- choose dry_run
- choose mock connectors
- simulate date/time if needed
- view logs

---

### 9.4 Dry Run

Dry run means:

```text
- receive input
- validate input
- load credentials
- run mapping/transformation
- prepare external API request
- do not send the real external API request
- log what would have happened
```

Example log:

```text
External API call skipped because execution mode is dry_run.
```

---

### 9.5 Mock Connectors

All external calls must go through connectors.

Each connector should have:

```text
real.js
mock.js
```

Example:

```text
src/connectors/whatsapp/real.js
src/connectors/whatsapp/mock.js
```

In live mode:

```text
connectors.whatsapp = real connector
```

In mock mode:

```text
connectors.whatsapp = mock connector
```

Example mock:

```js
module.exports = {
  async sendMessage(data) {
    return {
      success: true,
      mocked: true,
      providerMessageId: "mock-message-123",
      request: data
    };
  }
};
```

---

### 9.6 Replay

Every execution should be replayable.

Dashboard button:

```text
Replay as test
```

Flow:

```text
1. User opens previous execution.
2. User clicks Replay as test.
3. System creates a new execution.
4. System copies original input payload.
5. System runs in test/dry_run/mock mode.
6. Logs are saved separately.
```

---

### 9.7 Step-Level Testing

The dashboard should eventually support:

```text
Validate Payload
Test Mapping
Test Handler
Test Connector
Dry Run
Run Live
Replay
```

For MVP, implement at least:

```text
Run Test
Dry Run
Mock Output
Replay
Test Connector
```

---

### 9.8 Test Connector / Test Credentials

Each connector should expose:

```js
async testConnection(credentials) {
  return {
    success: true,
    message: "Connection successful"
  };
}
```

The dashboard should show a button:

```text
Test Credentials
```

This lets the user validate credentials before running the full integration.

---

### 9.9 Automated Code Tests

The repository should include automated tests.

Test categories:

```text
unit tests
integration tests
webhook tests
credential schema tests
handler contract tests
connector mock tests
permission tests
log isolation tests
```

Minimum tests:

- user can only see own logs
- admin can see all logs
- integration.js is loaded correctly
- missing required credential blocks execution
- webhook creates execution record
- manual test creates execution record
- dry_run does not call real connector
- mock_output uses mock connector
- replay creates new execution with copied payload
- failed handler writes failed execution status
- secret fields are not returned to frontend

---

## 10. Security Rules

### 10.1 User Isolation

Every backend query must enforce user ownership.

Normal user:

```text
can access only rows where userId = loggedInUser.id
```

Admin:

```text
can access all users and integrations
```

Do not rely only on frontend filtering.

---

### 10.2 Secret Security

Rules:

- never store secrets in code
- never commit secrets to GitHub
- never show saved secret values in dashboard
- store production secrets in AWS Secrets Manager
- allow users to replace a secret but not read it
- log secret changes, but never log the secret value

---

### 10.3 Code Loading Safety

Do not load integration files directly from URL parameters.

Bad:

```js
require(`/integrations/${req.params.user}/${req.params.integration}/handler.js`);
```

Required behavior:

```text
1. Receive user/integration slug.
2. Find matching integration in DB.
3. Confirm it belongs to the right user.
4. Confirm integration is active.
5. Read registered code folder from DB.
6. Ensure folder is under allowed integrations root.
7. Load only registered handler.js.
```

---

### 10.4 Logs

Logs must never expose:

- passwords
- API keys
- access tokens
- refresh tokens
- full authorization headers
- database connection strings

Add log sanitization.

---

## 11. Local Development Instructions

### 11.1 Required Tools

Install:

```text
Node.js LTS
Git
VS Code
PostgreSQL or Docker Desktop
Postman or Insomnia
AWS CLI v2
EB CLI
```

Optional:

```text
LocalStack
```

---

### 11.2 Local Environment Modes

Use environment modes:

```env
AUTH_MODE=mock
QUEUE_MODE=local
SECRETS_MODE=local
SCHEDULER_MODE=local
LOG_MODE=console
CONNECTOR_MODE=mock
```

Example `.env`:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgres://postgres:password@localhost:5432/automation_app

AWS_REGION=us-west-2
AWS_PROFILE=automation-dev

AUTH_MODE=mock
QUEUE_MODE=local
SECRETS_MODE=local
SCHEDULER_MODE=local
LOG_MODE=console
CONNECTOR_MODE=mock

LOCAL_SECRET_KEY=dev-only-key
```

---

### 11.3 Local Run

```bash
git clone <repository-url>
cd <project-folder>
npm install
cp .env.example .env
npm run dev
```

Seed local database:

```bash
npm run db:migrate
npm run db:seed
```

Run tests:

```bash
npm test
```

Run webhook test:

```text
POST http://localhost:3000/webhooks/user_001/whatsapp-order
Content-Type: application/json
Authorization: Bearer test-token
```

---

## 12. AWS Tools and Purpose

### 12.1 Elastic Beanstalk

Use for hosting the Node.js app.

Purpose:

- host backend API
- host webhook endpoints
- scale application
- manage environments

Environments:

```text
testing
staging
production
```

Branch mapping:

```text
develop  -> testing
staging  -> staging
main     -> production
```

---

### 12.2 RDS PostgreSQL

Use as production database.

Stores:

- users
- integrations
- credential references
- webhook settings
- schedule settings
- executions
- logs

---

### 12.3 SQS

Use for queueing execution jobs.

Purpose:

- prevent webhook timeout
- process integrations asynchronously
- retry failed jobs
- use dead-letter queue for failed jobs

---

### 12.4 EventBridge Scheduler

Use for scheduled integrations.

Purpose:

- trigger integrations by cron/rate
- send job to SQS or call backend endpoint

---

### 12.5 Secrets Manager

Use for production secrets.

Stores:

- API tokens
- passwords
- OAuth secrets
- webhook tokens
- third-party credentials

---

### 12.6 Cognito

Use for production authentication.

Purpose:

- email/password login
- password reset
- optional MFA
- JWT authentication

---

### 12.7 CloudWatch Logs

Use for AWS infrastructure and application-level technical logs.

Application user-facing logs must still be saved in the application database.

---

### 12.8 IAM Roles

Use IAM roles for AWS permissions.

The app should have permissions only for:

- required SQS queues
- required Secrets Manager paths
- required CloudWatch logs
- required RDS access through network/security group

Do not use hardcoded AWS keys in production.

---

### 12.9 GitHub Actions or AWS CodePipeline

Use for CI/CD.

Pipeline should:

```text
1. install dependencies
2. run tests
3. build app
4. deploy to testing/staging/production
```

Do not deploy production if tests fail.

---

## 13. Minimal AWS Architecture

```text
Dashboard User
     ↓
Elastic Beanstalk Node.js App
     ↓
RDS PostgreSQL

Webhook Request
     ↓
Elastic Beanstalk Webhook Endpoint
     ↓
SQS Queue
     ↓
Node.js Worker
     ↓
Integration Handler
     ↓
External API

EventBridge Scheduler
     ↓
SQS Queue
     ↓
Node.js Worker
     ↓
Integration Handler
     ↓
External API

Secrets Manager
     ↑
Node.js App / Worker

CloudWatch Logs
     ↑
AWS services + platform logs
```

---

## 14. API Endpoints — MVP

### Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Admin Users

```text
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id
```

### Integrations

```text
GET    /api/integrations
POST   /api/integrations
GET    /api/integrations/:id
PATCH  /api/integrations/:id
GET    /api/integrations/:id/definition
GET    /api/integrations/:id/credentials
POST   /api/integrations/:id/credentials
```

### Webhooks

```text
POST /webhooks/:userSlug/:integrationSlug
```

### Executions

```text
GET  /api/integrations/:id/executions
GET  /api/executions/:executionId
POST /api/integrations/:id/run
POST /api/executions/:executionId/replay
```

### Logs

```text
GET /api/integrations/:id/logs
GET /api/executions/:executionId/logs
```

### Testing

```text
POST /api/integrations/:id/test
POST /api/integrations/:id/dry-run
POST /api/integrations/:id/test-connector
```

---

## 15. Dashboard Pages — MVP

### Login Page

- email
- password
- login button

### User Dashboard

- list of integrations
- integration status
- last execution status
- quick run/test button

### Integration Page

- name
- description
- type
- status
- credentials form generated from `integration.js`
- webhook URL or schedule settings
- manual run
- test mode
- dry run
- mock output
- latest executions
- latest logs

### Execution Page

- execution status
- trigger type
- execution mode
- input payload
- output payload
- error message
- logs
- replay button

### Admin Dashboard

- users
- all integrations
- failed executions
- system status

---

## 16. Development Phases

### Phase 1 — Core MVP

Build:

- auth mock mode
- users
- integrations
- integration loader
- credential schema from `integration.js`
- credential saving
- manual run
- logs
- executions

### Phase 2 — Webhooks

Build:

- webhook route
- token validation
- execution creation
- queue/local runner
- test webhook from dashboard

### Phase 3 — Scheduled Integrations

Build:

- local scheduler
- schedule settings
- EventBridge-ready structure
- manual run for schedule
- test schedule

### Phase 4 — Testing Tools

Build:

- dry run
- mock connectors
- replay
- test connector
- sample payloads

### Phase 5 — AWS Deployment

Build:

- Elastic Beanstalk setup
- RDS
- SQS
- Secrets Manager
- Cognito
- CloudWatch
- CI/CD

---

## 17. Acceptance Criteria

The MVP is acceptable only when:

- admin can create a user
- admin can create an integration for the user
- system can load `integration.js`
- dashboard displays credential fields dynamically
- user can save credentials
- secret credentials are not returned to frontend
- user can run integration manually
- webhook integration can be tested without real third-party call
- scheduled integration can be tested without waiting for schedule
- dry run does not call real API
- mock connector returns mock response
- execution record is created for each run
- logs are saved under user + integration + execution
- user cannot see another user's logs
- failed integration is marked failed
- replay can rerun a previous payload as test
- automated tests pass before deployment

---

## 18. Final Product Definition

The system is a Node.js user-based automation platform.

Each user owns multiple integrations.

Each integration has a definition file and a handler file.

The definition file declares the integration name, description, type, credential fields, helper texts, testing options, and sample payloads.

The handler file contains the custom business logic for that specific user and integration.

The platform supports webhook integrations and scheduled integrations.

Both integration types can be manually executed from the dashboard.

The platform saves every execution and every log under the correct user and integration.

The platform includes strong testing tools: manual run, mock input, mock output, dry run, test connector, and replay.

The platform is developed locally on Windows and deployed to AWS using standard AWS services.
