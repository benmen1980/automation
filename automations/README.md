# Standard automation metadata packages

Each directory named `<automation_id>_<slug>` contains the Phase 3 manifest and
automation-specific `AGENTS.md`. Runtime code is intentionally not moved in
this phase: `automation.json` points to the existing legacy source folder or
the existing independent worker package.

The registry in `src/core/automation-registry.js` discovers these packages and
resolves permanent IDs and legacy integration aliases. User assignment is
deliberately absent from these files; it remains Phase 2 Admin/database data.

The independent worker packages for `priority-order-itc`, `gmail-priority`,
and `shopify-priority` are represented as adapters where their logical
automation already has a database `automationId`. The Salesforce and
Priority sales/projects worker packages do not yet have database Integration
rows or permanent automation IDs, so Phase 3 does not invent identities for
them. Their existing `manifest.js` contracts and runtime remain unchanged.
