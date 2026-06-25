const {
  SESv2Client,
  SendEmailCommand,
  GetEmailIdentityCommand,
  GetAccountCommand,
} = require('@aws-sdk/client-sesv2');

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function base64Mime(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

function buildMimeMessage({ from, to, subject, text, attachments = [] }) {
  const recipients = normalizeRecipients(to);
  const boundary = `automation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text || '',
  ];

  for (const attachment of attachments) {
    const filename = attachment.filename || 'attachment.txt';
    const contentType = attachment.contentType || 'application/octet-stream';
    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64Mime(attachment.content || '')
    );
  }

  parts.push(`--${boundary}--`, '');
  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
}

function getConfig(credentials = {}) {
  return {
    region: credentials.AWS_REGION || credentials.SES_REGION || process.env.AWS_REGION || 'eu-west-1',
    fromEmail: credentials.SES_FROM_EMAIL || process.env.SES_FROM_EMAIL,
    configurationSetName: credentials.SES_CONFIGURATION_SET || process.env.SES_CONFIGURATION_SET,
  };
}

function formatSesError(err) {
  if (err.name === 'MessageRejected') {
    return 'Amazon SES rejected the message. Verify the sender identity and, if the account is in sandbox, verify every recipient or request production access.';
  }
  if (err.name === 'NotFoundException') {
    return 'Amazon SES sender identity was not found in this AWS region.';
  }
  if (err.name === 'AccessDeniedException' || err.name === 'UnauthorizedException') {
    return 'AWS credentials do not allow SES sending. Grant ses:SendEmail and ses:GetEmailIdentity to the app role.';
  }
  return `Amazon SES error: ${err.message}`;
}

module.exports = {
  async sendEmail({ to, subject, text, attachments = [] }, credentials) {
    const recipients = normalizeRecipients(to);
    if (recipients.length === 0) throw new Error('SES send requires at least one recipient.');

    const config = getConfig(credentials);
    if (!config.fromEmail) throw new Error('SES send requires SES_FROM_EMAIL.');

    const client = new SESv2Client({ region: config.region });
    const raw = buildMimeMessage({ from: config.fromEmail, to: recipients, subject, text, attachments });

    try {
      const result = await client.send(
        new SendEmailCommand({
          FromEmailAddress: config.fromEmail,
          Destination: { ToAddresses: recipients },
          ...(config.configurationSetName ? { ConfigurationSetName: config.configurationSetName } : {}),
          Content: { Raw: { Data: Buffer.from(raw, 'utf8') } },
        })
      );
      return {
        success: true,
        provider: 'aws-ses',
        providerMessageId: result.MessageId || null,
        recipientCount: recipients.length,
        region: config.region,
      };
    } catch (err) {
      throw new Error(formatSesError(err));
    }
  },

  async testConnection(credentials = {}) {
    const config = getConfig(credentials);
    if (!config.fromEmail) {
      return {
        success: false,
        provider: 'aws-ses',
        message: 'Missing SES_FROM_EMAIL.',
        nextSteps: ['Set SES_FROM_EMAIL to a verified SES email address or domain sender.'],
      };
    }

    const client = new SESv2Client({ region: config.region });
    try {
      const [identity, account] = await Promise.all([
        client.send(new GetEmailIdentityCommand({ EmailIdentity: config.fromEmail })),
        client.send(new GetAccountCommand({})).catch(() => null),
      ]);
      const verified = identity.VerificationStatus === 'SUCCESS';
      return {
        success: verified,
        provider: 'aws-ses',
        region: config.region,
        message: verified
          ? `SES sender identity is verified in ${config.region}.`
          : `SES sender identity exists but is not verified yet (${identity.VerificationStatus || 'unknown'}).`,
        verificationStatus: identity.VerificationStatus || null,
        productionAccessEnabled: account?.ProductionAccessEnabled ?? null,
        nextSteps: verified
          ? []
          : ['Open Amazon SES in the same region and complete sender/domain verification before sending.'],
      };
    } catch (err) {
      return {
        success: false,
        provider: 'aws-ses',
        region: config.region,
        message: formatSesError(err),
        nextSteps: [
          'Create and verify an SES identity for SES_FROM_EMAIL in this AWS region.',
          'If running on AWS, make sure the Elastic Beanstalk EC2 role can call ses:GetEmailIdentity and ses:SendEmail.',
        ],
      };
    }
  },

  _diagnostics: { buildMimeMessage, normalizeRecipients, getConfig, formatSesError },
};
