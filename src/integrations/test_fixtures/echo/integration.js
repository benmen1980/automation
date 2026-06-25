/**
 * Fixture integration used ONLY by the automated test suite
 * (tests/integration/*.test.js). It is intentionally simple and
 * deterministic so tests don't depend on the real example integrations'
 * business rules (whatsapp-order, stock-sync).
 *
 * Do not wire this up in the seed script or the dashboard — it exists
 * purely under src/integrations/test_fixtures/ so integration-loader's
 * path-traversal checks (which require codeFolder to live under
 * INTEGRATIONS_ROOT) accept it like any real integration would.
 */
module.exports = {
  name: 'Test Echo',
  description: 'Deterministic fixture integration used by the automated test suite.',
  type: 'webhook',
  manualRun: true,
  connectors: ['whatsapp'],
  credentialTests: ['whatsapp'],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-test-echo',
    steps: ['Received from test fixture webhook', 'Echoed payload summary', 'Optionally called mock connector'],
  },

  webhook: {
    method: 'POST',
    requiresToken: true,
  },

  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'dry_run',
    modes: ['dry_run', 'test', 'mock_output', 'live'],
    modeDescriptions: {
      dry_run: 'Skips connector calls and returns what would have happened.',
      test: 'Runs the deterministic test fixture handler with saved fixture credentials.',
      mock_output: 'Uses the mock WhatsApp connector for connector-call assertions.',
      live: 'Runs the fixture handler with the real connector binding for test coverage only.',
    },
  },

  credentials: [
    {
      key: 'API_TOKEN',
      label: 'API Token',
      type: 'secret',
      required: true,
      helper: 'Fixture secret credential with no default — used to test that a missing required credential blocks execution.',
    },
    {
      key: 'GREETING',
      label: 'Greeting',
      type: 'text',
      required: false,
      defaultValue: 'Hello',
      helper: 'Fixture non-secret credential with a default value.',
    },
    {
      key: 'LEGACY_SECRET',
      label: 'Legacy Secret',
      type: 'secret',
      required: false,
      defaultValue: 'legacy-default-value',
      helper: 'Fixture secret credential WITH a default — used to test that secret fields never leak their value (saved or default) to the frontend.',
    },
  ],

  testPayloads: [
    {
      name: 'Basic',
      description: 'Basic echo payload with no special flags.',
      payload: { hello: 'world' },
    },
    {
      name: 'Trigger failure',
      description: 'Sets shouldFail so the handler throws, for testing failed-execution handling.',
      payload: { shouldFail: true },
    },
  ],
};
