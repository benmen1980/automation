const ses = require('../../src/connectors/ses/real');
const handler = require('../../src/integrations/user_001/priority-inventory-to-email/handler');

describe('ses connector diagnostics', () => {
  test('testConnection reports missing SES sender clearly', async () => {
    const result = await ses.testConnection({});
    expect(result).toMatchObject({
      success: false,
      provider: 'aws-ses',
      message: 'Missing SES_FROM_EMAIL.',
    });
    expect(result.nextSteps.join(' ')).toContain('SES_FROM_EMAIL');
  });

  test('MIME builder includes JSON attachments for SES raw email', () => {
    const message = ses._diagnostics.buildMimeMessage({
      from: 'automation@example.test',
      to: ['ops@example.test'],
      subject: 'Inventory',
      text: 'Attached',
      attachments: [{ filename: 'inventory.json', contentType: 'application/json', content: '{"ok":true}' }],
    });

    expect(message).toContain('From: automation@example.test');
    expect(message).toContain('To: ops@example.test');
    expect(message).toContain('Subject: Inventory');
    expect(message).toContain('filename="inventory.json"');
    expect(message).toContain('Content-Type: application/json; name="inventory.json"');
  });
});

describe('priority inventory email provider selection', () => {
  function logger() {
    return { async info() {}, async error() {}, async warning() {}, async debug() {} };
  }

  test('uses SES by default for email_test', async () => {
    const calls = [];
    const result = await handler.execute({
      credentials: {
        PRIORITY_INVENTORY_URL: 'https://priority.example.test/PARTBAL',
        EMAIL_TO_GROUP: 'ops@example.test',
        SES_FROM_EMAIL: 'automation@example.test',
      },
      logger: logger(),
      executionMode: 'email_test',
      connectors: {
        ses: {
          async sendEmail(payload) {
            calls.push(payload);
            return { success: true, provider: 'aws-ses', providerMessageId: 'ses-1' };
          },
        },
        gmail: {
          async sendEmail() {
            throw new Error('Gmail should not be used when EMAIL_PROVIDER is omitted.');
          },
        },
      },
    });

    expect(result.provider).toBe('aws-ses');
    expect(calls).toHaveLength(1);
    expect(calls[0].attachments[0].filename).toMatch(/^priority-inventory-email_test-/);
  });

  test('uses Gmail only when EMAIL_PROVIDER is gmail', async () => {
    const result = await handler.execute({
      credentials: {
        EMAIL_PROVIDER: 'gmail',
        PRIORITY_INVENTORY_URL: 'https://priority.example.test/PARTBAL',
        EMAIL_TO_GROUP: 'ops@example.test',
      },
      logger: logger(),
      executionMode: 'email_test',
      connectors: {
        ses: {
          async sendEmail() {
            throw new Error('SES should not be used when EMAIL_PROVIDER is gmail.');
          },
        },
        gmail: {
          async sendEmail() {
            return { success: true, provider: 'gmail-api', providerMessageId: 'gmail-1' };
          },
        },
      },
    });

    expect(result.provider).toBe('gmail-api');
  });
});
