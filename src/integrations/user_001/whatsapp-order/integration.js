module.exports = {
  name: "WhatsApp Order Notification",
  integrationKey: "int_e3c8f1a6d5b20974",
  description: "Receives order data and sends a WhatsApp message.",
  type: "webhook",
  manualRun: true,
  connectors: ["whatsapp"],
  credentialTests: ["whatsapp"],
  logging: {
    direction: "INBOUND",
    reviewRequired: true,
    cloudWatchLogGroup: "integration-user-001-whatsapp-order",
    steps: ["Received order webhook", "Validated recipient phone", "Sent to WhatsApp", "Received from WhatsApp"]
  },

  webhook: {
    method: "POST",
    requiresToken: true
  },

  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: "dry_run",
    modes: ["dry_run", "test", "mock_output", "live"],
    modeDescriptions: {
      dry_run: "Validates the payload and reports the WhatsApp message that would be sent without calling WhatsApp.",
      test: "Uses saved credentials and the sample payload to exercise the handler in a controlled local test.",
      mock_output: "Uses the mock WhatsApp connector so no real WhatsApp message is sent.",
      live: "Sends a real WhatsApp message using the saved WhatsApp API credentials."
    }
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
