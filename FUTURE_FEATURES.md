# Future Features and Architecture Notes

## LLM-Only Integration Creation

Users must not create new integrations directly through the admin UI.

The intended flow is:

1. The user chats with Codex and describes the integration they need.
2. Codex asks the required clarification questions, following `LOCAL_DEVELOPMENT.md`.
3. Codex receives the API/Postman structures, credentials shape, dummy data, test expectations, and business rules.
4. Codex generates the integration files, test modes, credential schema, and database registration.
5. The admin UI displays and manages the generated integration, but does not provide a generic "create integration" form.

The UI may eventually include a button or entry point such as "Request new integration", but it should open or guide the user into the Codex chat workflow. It should not create database records or integration skeletons by itself.

## Hot-Pluggable Integration Architecture

Adding a new integration must be isolated from deploying or restarting the core application.

A new integration should be added by:

- Creating or updating integration files under the user's integration folder.
- Registering the integration in the database.
- Saving its credential field definitions, schedule/webhook settings, and metadata.
- Loading or refreshing the integration registry dynamically.

A new integration should not require:

- Restarting the backend server.
- Restarting the frontend server.
- Rebuilding or redeploying the whole application.
- Changing shared application code for normal integration-specific behavior.

The core system should treat integrations as plug-ins or dynamic modules. The application should be able to discover newly added integrations from files and database records at runtime, or through a targeted registry refresh action.

## Runtime Isolation Goal

Each generated integration must remain isolated from the core platform and from other integrations.

Future implementation should ensure:

- A bug in one integration does not crash the main server.
- Integration execution happens in an isolated worker/process/job boundary.
- Logs, executions, credentials, schedules, and files are scoped by user and integration.
- Adding or updating one integration does not affect existing integrations.
- Test/dry-run/live behavior is defined per integration and loaded from the integration metadata.

## Deployment Direction

The long-term architecture should separate these concerns:

- Core platform deployment: users, auth, dashboard, registry, scheduler, webhook router, logging, workers.
- Integration package lifecycle: generated code, integration metadata, credentials schema, tests, sample data, and mapping rules.

The platform should be deployed rarely and deliberately. Integrations should be created, updated, tested, enabled, disabled, or removed without redeploying the platform.
