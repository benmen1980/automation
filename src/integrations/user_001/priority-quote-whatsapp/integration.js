module.exports = {
  name: 'Priority Quote Notification to WhatsApp',
  description: 'Receives a Priority quote webhook and sends a WhatsApp template notification.',
  type: 'webhook',
  manualRun: true,

  connectors: ['whatsappCloud'],
  credentialTests: ['whatsappCloud'],
  webhook: {
    method: 'POST',
    requiresToken: true,
  },

  logging: {
    direction: 'OUTBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: 'integration-priority-quote-whatsapp',
    steps: [
      'Received from Priority',
      'Mapped quote fields to WhatsApp template parameters',
      'Sent to WhatsApp',
      'Received from WhatsApp',
    ],
  },

  testing: {
    allowManualPayload: true,
    allowDryRun: true,
    allowMockOutput: true,
    allowReplay: true,
    defaultMode: 'dry_run',
    modes: ['dry_run', 'test', 'mock_output', 'live'],
    modeDescriptions: {
      dry_run: 'Validates the Priority quote payload and shows the WhatsApp template request summary without sending a message.',
      test: 'Builds the WhatsApp template request with saved credentials, but does not call WhatsApp.',
      mock_output: 'Returns a mock WhatsApp response so the flow can be tested without sending a message.',
      live: 'Sends a real WhatsApp template message through Meta Graph API.',
    },
  },

  credentials: [
    {
      key: 'WHATSAPP_ACCESS_TOKEN',
      label: 'WhatsApp Access Token',
      type: 'text',
      required: true,
      helper: 'Bearer token for the Meta WhatsApp Cloud API. This is a visible integration parameter on this local setup page, and logs still redact it.',
      placeholder: 'Paste Meta Graph API bearer token',
      validation: { minLength: 20 },
    },
    {
      key: 'WHATSAPP_PHONE_NUMBER_ID',
      label: 'WhatsApp Phone Number ID',
      type: 'text',
      required: true,
      defaultValue: '404655686058819',
      helper: 'Meta phone number ID used in the Graph API messages endpoint.',
      placeholder: '404655686058819',
    },
    {
      key: 'WHATSAPP_RECIPIENT_PHONE',
      label: 'Recipient Phone Number',
      type: 'text',
      required: true,
      helper: 'Destination WhatsApp number in international format without a plus sign. This is a visible integration parameter.',
      placeholder: '972507573753',
      validation: { pattern: '^\\d{8,15}$' },
    },
    {
      key: 'WHATSAPP_TEMPLATE_NAME',
      label: 'Template Name',
      type: 'text',
      required: true,
      defaultValue: 'order_status',
      helper: 'Approved WhatsApp template name in Meta.',
      placeholder: 'order_status',
    },
    {
      key: 'WHATSAPP_LANGUAGE_CODE',
      label: 'Template Language Code',
      type: 'text',
      required: true,
      defaultValue: 'he',
      helper: 'Language code for the approved WhatsApp template.',
      placeholder: 'he',
    },
    {
      key: 'WHATSAPP_GRAPH_API_VERSION',
      label: 'Graph API Version',
      type: 'text',
      required: true,
      defaultValue: 'v25.0',
      helper: 'Meta Graph API version used to build the messages endpoint.',
      placeholder: 'v25.0',
    },
  ],

  testPayloads: [
    {
      name: 'Priority quote approved',
      description: 'Priority quote payload that maps CDES to parameter 1 and CPROFNUM to parameter 2.',
      payload: {
        CPROF: {
          CPROFNUM: 'PQ26000001',
          CDES: 'דניאל כהן',
        },
      },
    },
  ],
};
