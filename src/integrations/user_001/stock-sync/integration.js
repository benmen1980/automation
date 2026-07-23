module.exports = {
  name: "Stock Sync",
  integrationKey: "int_d5a17c9e4f02b638",
  description: "Checks stock levels on a schedule and emails a low-stock alert.",
  type: "scheduled",
  manualRun: true,
  connectors: ["genericRest", "email"],
  credentialTests: ["genericRest", "email"],
  logging: {
    direction: "OUTBOUND",
    reviewRequired: true,
    cloudWatchLogGroup: "integration-stock-sync",
    steps: ["Received from inventory API", "Detected low-stock rows", "Sent to email provider", "Received from email provider"]
  },

  schedule: {
    defaultCron: "0 2 * * *",
    defaultTimezone: "Asia/Jerusalem"
  },

  testing: {
    allowManualPayload: false,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: "dry_run",
    modes: ["dry_run", "mock_output", "live"],
    modeDescriptions: {
      dry_run: "Checks the configured thresholds and explains the planned stock sync without calling external systems.",
      mock_output: "Uses mock inventory/email connector responses so no real provider is called.",
      live: "Calls the real inventory API and sends a real low-stock alert through the configured email provider."
    }
  },

  credentials: [
    {
      key: "API_BASE_URL",
      label: "Inventory API Base URL",
      type: "url",
      required: true,
      helper: "Base URL of the inventory system's REST API.",
      placeholder: "https://inventory.example.com/api/"
    },
    {
      key: "API_KEY",
      label: "Inventory API Key",
      type: "secret",
      required: true,
      helper: "API key for the inventory system. Stored securely and never shown again after saving.",
      validation: {
        minLength: 8
      }
    },
    {
      key: "LOW_STOCK_THRESHOLD",
      label: "Low Stock Threshold",
      type: "number",
      required: false,
      helper: "Send an alert when any SKU's quantity falls at or below this number.",
      defaultValue: 5
    },
    {
      key: "EMAIL_API_URL",
      label: "Email API URL",
      type: "url",
      required: true,
      helper: "HTTP endpoint used to send the alert email."
    },
    {
      key: "EMAIL_API_KEY",
      label: "Email API Key",
      type: "secret",
      required: true,
      helper: "API key for the email sending provider."
    },
    {
      key: "ALERT_RECIPIENT",
      label: "Alert Recipient Email",
      type: "email",
      required: true,
      helper: "Where to send the low-stock alert."
    }
  ],

  testPayloads: [
    {
      name: "Manual trigger (no payload)",
      description: "Scheduled integrations usually run with no input payload.",
      payload: {}
    }
  ]
};
