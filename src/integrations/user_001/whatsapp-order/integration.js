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
