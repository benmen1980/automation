module.exports = {
  name: 'Priority inventory to file',
  integrationKey: 'int_c91a7e4f28b603d5',
  description: 'Scheduled task that gets inventory from Priority PARTBAL and writes a timestamped JSON file locally under the user folder.',
  type: 'scheduled',
  manualRun: true,

  connectors: ['priority'],
  credentialTests: ['priority'],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-priority-inventory-to-file',
    steps: ['Sent inventory request to Priority', 'Received from Priority', 'Validated local output path', 'Wrote inventory JSON file'],
  },

  schedule: {
    defaultCron: '*/10 * * * *',
    defaultTimezone: 'Asia/Jerusalem',
  },

  testing: {
    allowManualPayload: false,
    allowDryRun: true,
    allowMockOutput: false,
    allowReplay: true,
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'live'],
    modeDescriptions: {
      test: 'Uses embedded dummy inventory data. Does not call Priority. Writes a timestamped local JSON file so the file output can be verified safely.',
      dry_run: 'Does not call Priority and does not write the final file. Returns the local file path and request details it would use.',
      live: 'Calls the real Priority PARTBAL endpoint with saved Basic Auth credentials and writes the real response to a timestamped local JSON file.',
    },
  },

  credentials: [
    {
      key: 'PRIORITY_INVENTORY_URL',
      label: 'Priority PARTBAL URL',
      type: 'url',
      required: true,
      helper: 'Full Priority ERP OData PARTBAL endpoint URL from the Postman request.',
      defaultValue: 'https://prioritydev4.simplyct.co.il/odata/Priority/tabula.ini/demo/PARTBAL',
    },
    {
      key: 'PRIORITY_BASIC_USERNAME',
      label: 'Priority Basic Auth Username',
      type: 'text',
      required: true,
      helper: 'Basic auth username from the Priority ERP REST API/Postman request.',
      defaultValue: 'API',
    },
    {
      key: 'PRIORITY_BASIC_PASSWORD',
      label: 'Priority Basic Auth Password',
      type: 'secret',
      required: true,
      helper: 'Basic auth password from the Priority ERP REST API/Postman request.',
    },
    {
      key: 'LOCAL_OUTPUT_DIR',
      label: 'Local Output Directory',
      type: 'text',
      required: true,
      helper: 'Relative local folder where timestamped inventory JSON files are written.',
      defaultValue: 'local-data/users/user_001/priority-inventory-to-file',
    },
  ],

  sampleData: {
    inventory: [
      { sku: 'SKU-100', quantity: 14, warehouse: 'MAIN' },
      { sku: 'SKU-200', quantity: 0, warehouse: 'MAIN' },
      { sku: 'SKU-300', quantity: 7, warehouse: 'NORTH' },
    ],
  },

  testPayloads: [
    {
      name: 'Embedded dummy Priority inventory',
      description: 'GET request has no body. Test mode uses the embedded dummy inventory below instead of calling Priority.',
      payload: {},
    },
  ],
};
