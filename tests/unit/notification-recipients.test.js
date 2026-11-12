jest.mock('../../src/core/deployment-safety', () => ({ emailSendingEnabled: () => true, assertEmailSendingAllowed: jest.fn() }));
const { createNotificationService, normalizeRecipients } = require('../../src/core/notification-recipients');

const integration = { id: 'int-a', userId: 'owner', name: 'בדיקה' };
let db, ses, verification, service, clock, logs, settings, leases;
beforeEach(() => {
  clock = 0; logs = new Map(); settings = new Map(); leases = new Map();
  db = {
    credential: {
      findUnique: jest.fn(async ({ where }) => settings.get(where.integrationId_key.integrationId)),
      upsert: jest.fn(async ({ where, create }) => settings.set(where.integrationId_key.integrationId, create)),
    },
    notificationLease: {
      updateMany: jest.fn(async ({ where, data }) => {
        if (!leases.has(where.id) || leases.get(where.id) > where.expiresAt.lte) return { count: 0 };
        leases.set(where.id, data.expiresAt); return { count: 1 };
      }),
      create: jest.fn(async ({ data }) => {
        if (leases.has(data.id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        leases.set(data.id, data.expiresAt); return data;
      }),
    },
    log: { create: jest.fn(async ({ data }) => {
      if (data.id && logs.has(data.id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      logs.set(data.id || String(logs.size), data); return data;
    }) },
  };
  ses = { send: jest.fn(async (command) => {
    if (command.constructor.name === 'GetAccountCommand') return { SendingEnabled: true, SendQuota: { MaxSendRate: 10, Max24HourSend: 100, SentLast24Hours: 0 } };
    if (command.constructor.name === 'SendEmailCommand') return { MessageId: 'message-1' };
    return { VerificationStatus: 'SUCCESS', VerifiedForSendingStatus: true };
  }) };
  verification = { send: jest.fn(async () => ({})) };
  service = createNotificationService({ db, ses, verification, now: () => new Date(clock), sleep: async (ms) => { clock += ms; } });
});
const stored = (id, emails) => settings.set(id, { valueReference: JSON.stringify(emails), isSecret: false });
const sends = () => ses.send.mock.calls.filter(([command]) => command.constructor.name === 'SendEmailCommand');

test('normalizes, deduplicates, rejects invalid input before persistence or SES', async () => {
  expect(normalizeRecipients(' A@EXAMPLE.COM, a@example.com , b@example.com ')).toEqual(['a@example.com', 'b@example.com']);
  expect(normalizeRecipients(' ')).toEqual([]);
  await expect(service.save(integration, 'valid@example.com, bad address')).rejects.toMatchObject({ statusCode: 400, invalid: ['bad address'] });
  expect(db.credential.upsert).not.toHaveBeenCalled(); expect(ses.send).not.toHaveBeenCalled(); expect(verification.send).not.toHaveBeenCalled();
});

test('membership stays scoped, verified recipients need no verification, clearing does not delete identities', async () => {
  stored('int-b', 'other@example.com');
  await service.save(integration, ' A@example.com, a@example.com ');
  expect(JSON.parse(settings.get('int-a').valueReference)).toBe('a@example.com');
  expect(JSON.parse(settings.get('int-b').valueReference)).toBe('other@example.com');
  expect(verification.send).not.toHaveBeenCalled();
  await service.save(integration, '');
  expect(await service.test(integration)).toEqual({ results: [], noVerifiedRecipients: true });
  expect(sends()).toHaveLength(0);
});

test('pending and missing identities use official verification; durable cooldown crosses integrations and service instances', async () => {
  ses.send.mockResolvedValue({ VerificationStatus: 'PENDING' });
  const second = createNotificationService({ db, ses, verification, now: () => new Date(clock), sleep: async (ms) => { clock += ms; } });
  const results = await Promise.all([service.save(integration, 'a@example.com'), second.save({ ...integration, id: 'int-b' }, 'a@example.com')]);
  expect(verification.send).toHaveBeenCalledTimes(1);
  expect(verification.send.mock.calls[0][0].constructor.name).toBe('VerifyEmailIdentityCommand');
  expect(results.flatMap((item) => item.recipients).map((item) => item.verificationRequest).sort()).toEqual(['accepted', 'cooldown']);
  clock += 900001;
  ses.send.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NotFoundException' }));
  await service.save(integration, 'a@example.com');
  expect(verification.send).toHaveBeenCalledTimes(2);
});

test('lookup outage and temporary failure do not verify or send, and do not undo saving', async () => {
  ses.send.mockRejectedValue(new Error('outage'));
  expect((await service.save(integration, 'a@example.com')).recipients[0].status).toBe('unknown');
  expect(settings.has('int-a')).toBe(true);
  ses.send.mockResolvedValue({ VerificationStatus: 'TEMPORARY_FAILURE' });
  expect((await service.test(integration)).results[0]).toMatchObject({ outcome: 'skipped', status: 'unknown' });
  expect(verification.send).not.toHaveBeenCalled(); expect(sends()).toHaveLength(0);
});

test('test uses saved recipients, refreshes verification and isolates recipient send failures', async () => {
  stored('int-a', 'pending@example.com, bad@example.com, good@example.com');
  const base = ses.send.getMockImplementation();
  ses.send.mockImplementation(async (command) => {
    if (command.input.EmailIdentity === 'pending@example.com') return { VerificationStatus: 'PENDING' };
    if (command.input.Destination?.ToAddresses[0] === 'bad@example.com') throw Object.assign(new Error('rejected'), { $metadata: { httpStatusCode: 400 } });
    return base(command);
  });
  const result = await service.test(integration);
  expect(result.results.map((item) => item.outcome)).toEqual(['skipped', 'failed', 'accepted']);
  expect(sends()).toHaveLength(2);
  expect(sends()[1][0].input.Content.Simple).toMatchObject({ Subject: { Data: 'מייל ניסיון — בדיקה' }, Body: { Text: { Data: 'זהו מייל ניסיון ממערכת AUTOMATION עבור האוטומציה בדיקה.' } } });
  expect(verification.send).not.toHaveBeenCalled();
});

test('same event from multiple layers deduplicates; attempts and startup events are independent', async () => {
  stored('int-a', 'a@example.com');
  const results = await Promise.all(['queue', 'runner'].map((stage) => service.notifyFailure(integration, new Error('password=hidden'), { executionId: 'run1', attempt: 1, stage })));
  expect(results.map((item) => item.status).sort()).toEqual(['duplicate', 'processed']);
  await service.notifyFailure(integration, new Error('oops'), { executionId: 'run1', attempt: 2 });
  await service.notifyFailure(integration, new Error('startup'), { eventId: 'start-1', attempt: 1 });
  expect(sends()).toHaveLength(3);
  expect(sends()[0][0].input.Content.Simple.Body.Text.Data).not.toContain('hidden');
  expect(sends()[0][0].input.Content.Simple.Subject.Data).toBe('שגיאה באוטומציה — בדיקה');
});

test('ambiguous sends are recorded and never automatically retried', async () => {
  stored('int-a', 'a@example.com');
  const base = ses.send.getMockImplementation();
  ses.send.mockImplementation((command) => command.constructor.name === 'SendEmailCommand' ? Promise.reject(new Error('timeout')) : base(command));
  const result = await service.notifyFailure(integration, new Error('original'), { executionId: 'run1', attempt: 1 });
  expect(result.results[0].outcome).toBe('unknown');
  expect((await service.notifyFailure(integration, new Error('original'), { executionId: 'run1', attempt: 1 })).status).toBe('duplicate');
  expect(sends()).toHaveLength(1);
  expect([...logs.values()].some((log) => log.eventType === 'automation.notification.unknown')).toBe(true);
});

test('quota exhaustion never submits mail and errors in persistence do not escape notification boundary', async () => {
  stored('int-a', 'a@example.com');
  const base = ses.send.getMockImplementation();
  ses.send.mockImplementation((command) => command.constructor.name === 'GetAccountCommand' ? Promise.resolve({ SendingEnabled: false }) : base(command));
  expect((await service.test(integration)).results[0].outcome).toBe('failed');
  expect(sends()).toHaveLength(0);
  db.log.create.mockRejectedValue(new Error('database down'));
  expect(await service.notifyFailure(integration, new Error('original'), { eventId: 'startup', attempt: 1 })).toEqual({ status: 'failed' });
});

test('verification request failure retains cooldown and later refresh observes successful verification', async () => {
  const base = ses.send.getMockImplementation();
  ses.send.mockResolvedValue({ VerificationStatus: 'PENDING' });
  verification.send.mockRejectedValue(new Error('timeout'));
  expect((await service.save(integration, 'a@example.com')).recipients[0].verificationRequest).toBe('failed');
  expect((await service.save(integration, 'a@example.com')).recipients[0].verificationRequest).toBe('cooldown');
  expect(verification.send).toHaveBeenCalledTimes(1);
  ses.send.mockImplementation(base);
  expect(await service.refresh(integration)).toEqual([{ email: 'a@example.com', status: 'verified' }]);
  expect((await service.test(integration)).results[0].outcome).toBe('accepted');
});

test('successful SES submission is not retried when recording the result fails', async () => {
  stored('int-a', 'a@example.com');
  const base = db.log.create.getMockImplementation();
  db.log.create.mockImplementation((input) => input.data.eventType.endsWith('accepted') ? Promise.reject(new Error('storage down')) : base(input));
  const context = { executionId: 'run1', attempt: 1 };
  expect((await service.notifyFailure(integration, new Error('failure'), context)).results[0].outcome).toBe('accepted');
  expect((await service.notifyFailure(integration, new Error('failure'), context)).status).toBe('duplicate');
  expect(sends()).toHaveLength(1);
});
