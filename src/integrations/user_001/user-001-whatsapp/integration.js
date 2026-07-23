module.exports = {
  name: 'User 001 WhatsApp Webhook',
  integrationKey: 'user-001-user-001-whatsapp',
  description: 'Receives WhatsApp-style webhook payloads for user_001 and writes each request body to a local JSON file.',
  type: 'webhook',
  manualRun: true,

  connectors: [],
  credentialTests: [],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-user-001-whatsapp',
    steps: ['Received from WhatsApp webhook', 'Validated local output path', 'Wrote webhook body to local file'],
  },

  webhook: {
    method: 'POST',
    requiresToken: true,
  },

  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: false,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'live'],
    modeDescriptions: {
      test: 'Writes the supplied sample payload to a local JSON file. No external provider is called.',
      dry_run: 'Reports the file path that would be written without writing the final file.',
      live: 'Writes the received webhook body to a local JSON file.',
    },
  },

  credentials: [
    {
      key: 'LOCAL_OUTPUT_DIR',
      label: 'Local Output Directory',
      type: 'text',
      required: true,
      defaultValue: 'local-data/users/user_001/user-001-whatsapp',
      helper: 'Relative folder where received webhook bodies are written. It must stay inside local-data/users/user_001.',
    },
  ],

  testPayloads: [
    {
      name: 'Sample WhatsApp webhook body',
      description: 'Small sample payload that is written to a local JSON file in test mode.',
      payload: {
        from: '+972501234567',
        message: 'Hello from WhatsApp',
        receivedAt: '2026-06-25T00:00:00.000Z',
      },
    },
  ],
};
