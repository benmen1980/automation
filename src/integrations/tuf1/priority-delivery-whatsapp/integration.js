module.exports = {
  "name": "שליחת וואצפ מתעודת משלוח",
  "displayName": "שליחת וואצפ מתעודת משלוח",
  "integrationKey": "int_1a8136b51db455ee",
  "version": "1.0.1",
  "description": "Receives DOCUMENTS_D, checks each contact name/phone pair, and sends up to two ITC messages containing name, customer order number and unchanged date text.",
  "type": "webhook",
  "direction": "OUTBOUND",
  "runtime": "lambda",
  "triggers": [
    "webhook",
    "manual"
  ],
  "manualRun": true,
  "connectors": [
    "itc"
  ],
  "credentialTests": [
    "itc"
  ],
  "webhook": {
    "method": "POST",
    "requiresToken": true
  },
  "logging": {
    "direction": "OUTBOUND",
    "reviewRequired": true,
    "cloudWatchLogGroup": "/aws/lambda/priority-delivery-itc",
    "steps": [
      "Execution started",
      "Received from Priority",
      "Sent to ITC",
      "Received from ITC",
      "Stored finalization state",
      "Updated dashboard execution status",
      "Execution finished"
    ]
  },
  "testing": {
    "allowManualPayload": true,
    "allowDryRun": true,
    "allowMockOutput": true,
    "allowReplay": true,
    "defaultMode": "dry_run",
    "modes": [
      "dry_run",
      "test",
      "mock_output",
      "live"
    ],
    "modeDescriptions": {
      "dry_run": "Checks both contact conditions and previews requests without sending.",
      "test": "Validates DOCUMENTS_D and ITC mapping without sending.",
      "mock_output": "Returns simulated ITC responses without external calls.",
      "live": "Sends eligible ITC messages with name, order number and unchanged CURDATE text."
    }
  },
  "credentials": [
    {
      "key": "ITC_TEMPLATE_MESSAGE_URL",
      "label": "ITC Template Message URL",
      "type": "text",
      "required": true,
      "defaultValue": "https://sv1.effective-oc.com/api/v2/msg/sendMsg/tempMsg/6a4b8dc15c44e81728f3d095",
      "helper": "Full ITC POST endpoint for this approved template, including the template ID at the end of the URL.",
      "helperUrl": "https://effective-oc.com/",
      "helperUrlLabel": "Open the Effective/ITC portal",
      "placeholder": "https://sv1.effective-oc.com/api/v2/msg/sendMsg/tempMsg/<template-id>",
      "validation": {
        "pattern": "^https://.+"
      }
    },
    {
      "key": "ITC_BEARER_TOKEN",
      "label": "ITC Bearer Token",
      "type": "secret",
      "required": true,
      "masked": true,
      "helper": "Bearer token supplied by ITC. It is stored securely, masked after saving, and never included in logs or API responses.",
      "helperUrl": "https://effective-oc.com/",
      "helperUrlLabel": "Open the Effective/ITC portal",
      "placeholder": "Paste a rotated ITC bearer token",
      "validation": {
        "minLength": 20
      }
    },
    {
      "key": "ITC_CHANNEL_ID",
      "label": "ITC Channel ID",
      "type": "text",
      "required": true,
      "defaultValue": "whatsapp:+97246960480",
      "helper": "ITC WhatsApp sending channel in the format whatsapp:+<country-code><number>.",
      "helperUrl": "https://effective-oc.com/",
      "helperUrlLabel": "Find the channel in the Effective/ITC portal",
      "placeholder": "whatsapp:+97246960480",
      "validation": {
        "pattern": "^whatsapp:\\+[0-9]{8,15}$"
      }
    }
  ],
  "deployment": {
    "pipelineName": "integration-priority-delivery-itc",
    "lambdaName": "priority-delivery-itc",
    "queueName": "priority-delivery-itc-queue",
    "dlqName": "priority-delivery-itc-dlq",
    "cloudWatchLogGroup": "/aws/lambda/priority-delivery-itc",
    "independentPipelineRequired": true,
    "apiMustNotRestart": true,
    "queueRequired": true,
    "dlqRequired": true,
    "scheduleRequired": false,
    "batchSize": 1,
    "reportBatchItemFailures": true,
    "timeoutSeconds": 60,
    "logRetentionDays": 30,
    "credentialSource": "dashboard-settings-and-secrets-manager-references",
    "workerStatusCallbackRequired": true,
    "finalizationTableName": "priority-delivery-itc-finalization",
    "idempotencyStrategy": "durable-in-flight-marker-before-itc-and-finalization-before-status-callback"
  },
  "uiux": {
    "reviewRequired": true,
    "credentialSectionTitle": "ITC settings",
    "showSavedSecretPlaceholder": true,
    "savedSecretPlaceholder": "•••••••• saved",
    "requireConnectionTestButton": true,
    "requireRunTestButton": true,
    "requireHelperText": true
  },
  "privacy": {
    "executionPayloadAllowlistPaths": [
      "DOCUMENTS_D.ORDNAME",
      "DOCUMENTS_D.CURDATE",
      "DOCUMENTS_D.YARD_CUSTDES",
      "DOCUMENTS_D.YARD_PHONENUM",
      "DOCUMENTS_D.YARD_NAME",
      "DOCUMENTS_D.YARD_FAX"
    ],
    "executionPayloadRedactionPaths": [
      "DOCUMENTS_D.YARD_PHONENUM",
      "DOCUMENTS_D.YARD_FAX"
    ]
  },
  "testPayloads": [
    {
      "name": "תעודת משלוח",
      "description": "Two contact pairs and date text passed unchanged.",
      "payload": {
        "DOCUMENTS_D": {
          "ORDNAME": "1597873",
          "CURDATE": "27.07.2026",
          "YARD_CUSTDES": "ירדן",
          "YARD_PHONENUM": "+972502009253",
          "YARD_NAME": "",
          "YARD_FAX": ""
        }
      }
    }
  ]
};
