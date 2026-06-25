# Automation App Integration Instructions

These instructions must be followed whenever this automation app is extended to connect with any external system, API, database, ERP, CRM, eCommerce platform, email service, messaging service, file service, or data source.

The app must not assume that Codex, ChatGPT, or the IDE has built-in access to the requested service. Every integration must be implemented as a real Node.js integration using the provider API, SDK, database driver, webhook, file protocol, or supported connection technology.

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

Every connector should follow this structure unless the existing project has a better convention:

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

Use the actual provider name, for example:

```text
src/integrations/gmail/
src/integrations/ms365/
src/integrations/shopify/
src/integrations/monday/
src/integrations/sqlserver/
src/integrations/priority/
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
