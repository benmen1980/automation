const crypto = require('crypto');
const { SESv2Client, GetEmailIdentityCommand, GetAccountCommand, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { SESClient, VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');
const { sanitizeString } = require('../utils/sanitize-logs');

const REGION = 'eu-west-1';
const RECIPIENTS_KEY = 'ERROR_NOTIFICATION_EMAILS';
const COOLDOWN_MS = 15 * 60 * 1000;
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeRecipients(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('יש להזין כתובות מופרדות בפסיק.'), { statusCode: 400 });
  if (!value.trim()) return [];
  const addresses = value.split(',').map((item) => item.trim().toLowerCase());
  const invalid = addresses.filter((item) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(item));
  if (invalid.length) throw Object.assign(new Error('כתובות מייל במבנה לא תקין.'), { statusCode: 400, invalid });
  return [...new Set(addresses)];
}

// Shared by the integration API and execution-failure reporting boundary.
function createNotificationService({ db = require('../db/client'),
  ses = new SESv2Client({ region: REGION, maxAttempts: 1 }),
  verification = new SESClient({ region: REGION, maxAttempts: 1 }),
  now = () => new Date(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const call = (client, command) => client.send(command, { abortSignal: AbortSignal.timeout(15000) });

  // Atomic across processes; a failed/ambiguous request retains its cooldown.
  async function lease(id, duration) {
    const time = now();
    const expiresAt = new Date(time.getTime() + duration);
    const updated = await db.notificationLease.updateMany({ where: { id, expiresAt: { lte: time } }, data: { expiresAt } });
    if (updated.count) return true;
    try { await db.notificationLease.create({ data: { id, expiresAt } }); return true; }
    catch (error) { if (error.code === 'P2002') return false; throw error; }
  }

  async function saved(integration) {
    const row = await db.credential.findUnique({ where: { integrationId_key: { integrationId: integration.id, key: RECIPIENTS_KEY } } });
    if (row?.isSecret) throw new Error('Notification recipients must not be secret settings.');
    return normalizeRecipients(row ? JSON.parse(row.valueReference) : '');
  }

  async function reserveRate(id, spacing) {
    if (spacing > 15000) return false;
    for (let elapsed = 0; elapsed <= 15000; elapsed += spacing) {
      if (await lease(id, spacing)) return true;
      await sleep(spacing);
    }
    return false;
  }

  async function inspect(email) {
    try {
      const identity = await call(ses, new GetEmailIdentityCommand({ EmailIdentity: email }));
      if (identity.VerificationStatus === 'SUCCESS' && identity.VerifiedForSendingStatus === true) return { email, status: 'verified' };
      if (['PENDING', 'FAILED', 'NOT_STARTED'].includes(identity.VerificationStatus)) return { email, status: 'pending' };
      return { email, status: 'unknown' };
    } catch (error) {
      return { email, status: error.name === 'NotFoundException' ? 'pending' : 'unknown' };
    }
  }

  async function refresh(integration) {
    const result = [];
    for (const email of await saved(integration)) result.push(await inspect(email));
    return result;
  }

  async function save(integration, value) {
    const recipients = normalizeRecipients(value);
    const data = { valueReference: JSON.stringify(recipients.join(', ')), type: 'text', isSecret: false };
    await db.credential.upsert({ where: { integrationId_key: { integrationId: integration.id, key: RECIPIENTS_KEY } },
      create: { userId: integration.userId, integrationId: integration.id, key: RECIPIENTS_KEY, ...data }, update: data });
    const result = [];
    for (const email of recipients) {
      const item = await inspect(email);
      if (item.status === 'pending') {
        try {
          if (!await lease(`ses:${REGION}:verify:${hash(email)}`, COOLDOWN_MS)) item.verificationRequest = 'cooldown';
          else {
            // All application instances share the same AWS account/region lane.
            if (!await reserveRate(`ses:${REGION}:verify-rate`, 1000)) throw new Error('Verification rate limit reached.');
            await call(verification, new VerifyEmailIdentityCommand({ EmailAddress: email }));
            item.verificationRequest = 'accepted';
          }
        } catch { item.verificationRequest = 'failed'; }
      }
      result.push(item);
    }
    return { recipients: result };
  }

  async function audit(integration, eventType, metadata, context = {}, id) {
    return db.log.create({ data: {
      ...(id ? { id } : {}), userId: integration.userId, integrationId: integration.id,
      executionId: context.executionId || null, correlationId: context.eventId || context.executionId || null,
      attempt: context.attempt || null, level: /\.(failed|unknown)$/.test(eventType) ? 'error' : 'info',
      eventType, message: 'Automation notification result.', metadata: JSON.stringify(metadata),
    } });
  }

  async function send(integration, message, context = {}) {
    const results = [];
    for (const recipient of await refresh(integration)) {
      let result = { ...recipient, outcome: 'skipped', reason: recipient.status };
      if (recipient.status === 'verified') {
        let submitted = false;
        try {
          const account = await call(ses, new GetAccountCommand({}));
          const quota = account.SendQuota;
          if (!account.SendingEnabled || !quota || quota.MaxSendRate <= 0 || quota.SentLast24Hours >= quota.Max24HourSend) {
            result = { ...recipient, outcome: 'failed', reason: 'sending_unavailable_or_quota' };
          } else {
            const spacing = Math.max(1, Math.ceil(1000 / quota.MaxSendRate));
            if (!await reserveRate(`ses:${REGION}:send-rate`, spacing)) throw new Error('Sending rate limit reached.');
            submitted = true;
            const response = await call(ses, new SendEmailCommand({
              FromEmailAddress: 'roy@simplyct.co.il', FeedbackForwardingEmailAddress: 'roy@simplyct.co.il',
              Destination: { ToAddresses: [recipient.email] },
              Content: { Simple: { Subject: { Data: message.subject, Charset: 'UTF-8' }, Body: { Text: { Data: message.text, Charset: 'UTF-8' } } } },
            }));
            result = { ...recipient, outcome: 'accepted', messageId: response.MessageId };
          }
        } catch (error) {
          result = { ...recipient, outcome: submitted && !error.$metadata?.httpStatusCode ? 'unknown' : 'failed', reason: 'send_error' };
        }
      }
      results.push(result);
      // Audit failure must never turn a successful send into a retry.
      await audit(integration, `automation.notification.${result.outcome}`, result, context).catch(() => {});
    }
    return { results, noVerifiedRecipients: !results.some((item) => item.status === 'verified') };
  }

  async function test(integration) {
    return send(integration, { subject: `מייל ניסיון — ${integration.name}`,
      text: `זהו מייל ניסיון ממערכת AUTOMATION עבור האוטומציה ${integration.name}.` });
  }

  // Caller supplies the SAME event ID and attempt at every reporting layer.
  // Startup failures can supply eventId without an execution row.
  async function notifyFailure(integration, error, context = {}) {
    try {
      if (!(context.executionId || context.eventId) || !Number.isInteger(context.attempt) || context.attempt < 1) throw new Error('Event identity and positive attempt required.');
      const identity = context.executionId || `${integration.id}:${context.eventId}`;
      const id = `alert_${hash([identity, context.attempt, 'claim'])}`;
      try { await audit(integration, 'automation.notification.claimed', {}, context, id); }
      catch (failure) { if (failure.code === 'P2002') return { status: 'duplicate' }; throw failure; }
      const text = [
        `שם האוטומציה: ${integration.name}`,
        `מועד השגיאה: ${new Date(context.occurredAt || now()).toISOString()}`,
        `פרטי השגיאה: ${sanitizeString(String(error?.message || error))}`,
        context.stage && `שלב הכשל: ${sanitizeString(String(context.stage))}`,
        context.executionId && `מזהה הריצה: ${context.executionId}`,
      ].filter(Boolean).join('\n');
      return { status: 'processed', ...await send(integration, { subject: `שגיאה באוטומציה — ${integration.name}`, text }, context) };
    } catch {
      await audit(integration, 'automation.notification.failed', { reason: 'notification_failed' }, context).catch(() => {});
      return { status: 'failed' };
    }
  }

  return { refresh, save, test, notifyFailure };
}

module.exports = { createNotificationService, normalizeRecipients, RECIPIENTS_KEY, REGION };
