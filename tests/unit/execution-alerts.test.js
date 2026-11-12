jest.mock('../../src/db/client', () => ({
  execution: { findUnique: jest.fn() }, credential: { findUnique: jest.fn() },
  notificationLease: { updateMany: jest.fn(), create: jest.fn() },
  log: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
}));
jest.mock('../../src/core/integration-loader', () => ({ loadDefinition: jest.fn(() => { throw new Error('Definition unavailable'); }) }));
jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn(() => ({ send: (...args) => mockSend(...args) })),
  GetAccountCommand: class { constructor(input) { this.input = input; } },
  GetEmailIdentityCommand: class { constructor(input) { this.input = input; } },
  SendEmailCommand: class { constructor(input) { this.input = input; } },
}));
const mockSend = jest.fn();
const prisma = require('../../src/db/client');
const loader = require('../../src/core/integration-loader');
const { notifyExecutionFailure, collectExecutionLogs, key } = require('../../src/core/execution-alerts');
const { reconcileExpiredAttempts } = require('../../src/core/execution-telemetry');
const execution = { id: 'run1', integrationId: 'int1', userId: 'u1', retryCount: 0, executionMode: 'live', integration: { id: 'int1', userId: 'u1', name: 'Example' } };
let rows;
let buildMessage;
beforeEach(() => {
  jest.clearAllMocks(); rows = [];
  prisma.execution.findUnique.mockResolvedValue(execution);
  prisma.credential.findUnique.mockResolvedValue({ valueReference: '"ops@example.test"', isSecret: false });
  prisma.log.create.mockImplementation(async ({ data }) => {
    if (data.id && rows.some((row) => row.id === data.id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    const row = { createdAt: new Date(), id: String(rows.length), ...data }; rows.push(row); return row;
  });
  prisma.log.findUnique.mockImplementation(async ({ where }) => rows.find((row) => row.id === where.id));
  prisma.log.findMany.mockImplementation(async ({ where }) => rows.filter((row) =>
    where.eventType ? row.eventType === where.eventType : row.executionId === where.executionId && row.integrationId === where.integrationId && row.createdAt <= where.createdAt.lte));
  buildMessage = jest.fn(async ({ logs }) => ({ subject: 'Failure', text: JSON.stringify(logs) }));
  loader.loadDefinition.mockReturnValue({ failureNotification: { recipientsKey: 'ALERTS', resolveRecipients: (value) => value || [], buildMessage } });
  prisma.notificationLease.updateMany.mockResolvedValue({ count: 1 });
  mockSend.mockImplementation(async (command) => {
    if (command.input.EmailIdentity) return { VerificationStatus: 'SUCCESS', VerifiedForSendingStatus: true };
    if (!command.input.Destination) return { SendingEnabled: true, SendQuota: { MaxSendRate: 10, Max24HourSend: 100, SentLast24Hours: 0 } };
    return { MessageId: 'ses1' };
  });
});

test('durable claims suppress concurrent duplicates but permit each failed attempt', async () => {
  await Promise.all([1, 1, 2].map((attempt) => notifyExecutionFailure('run1', new Error('original'), { attempt })));
  expect(mockSend.mock.calls.filter(([command]) => command.input.Destination)).toHaveLength(2);
  expect(rows.filter((r) => r.eventType === 'automation.notification.accepted')).toHaveLength(2);
});

test('full snapshot contains previous attempts, excludes other runs and post-send result, and redacts secrets', async () => {
  for (let i = 0; i < 1200; i++) rows.push({ id: String(i), executionId: 'run1', integrationId: 'int1', createdAt: new Date(0), attempt: 1, message: 'old', metadata: '{"password":"hidden"}' });
  rows.push({ id: 'other', executionId: 'run2', integrationId: 'int1', createdAt: new Date(0), message: 'unrelated' });
  const logs = await collectExecutionLogs('run1', { integrationId: 'int1' });
  expect(logs).toHaveLength(1200);
  expect(JSON.stringify(logs)).not.toMatch(/hidden|unrelated/);
  const through = new Date(1);
  await collectExecutionLogs('run1', { integrationId: 'int1', through });
  expect(prisma.log.findMany).toHaveBeenLastCalledWith({ where: { executionId: 'run1', integrationId: 'int1', createdAt: { lte: through } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
});

test('no recipients produces a skip without SES or template', async () => {
  prisma.credential.findUnique.mockResolvedValue(null);
  expect(await notifyExecutionFailure('run1', new Error('original'))).toMatchObject({ status: 'processed', results: [], noVerifiedRecipients: true });
  expect(mockSend).not.toHaveBeenCalled(); expect(buildMessage).not.toHaveBeenCalled();
});

test('SES rejection never escapes or retries the original business operation', async () => {
  const base = mockSend.getMockImplementation();
  mockSend.mockImplementation((command) => command.input.Destination ? Promise.reject(new Error('SES timeout token=secret')) : base(command));
  expect(await notifyExecutionFailure('run1', new Error('original'))).toMatchObject({ status: 'processed', results: [{ outcome: 'unknown' }] });
  expect(await notifyExecutionFailure('run1', new Error('original'))).toEqual({ status: 'duplicate' });
  expect(mockSend.mock.calls.filter(([command]) => command.input.Destination)).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain('token=secret');
});

test('watchdog detects missing acknowledgement once, including after restart', async () => {
  rows.push({ id: key('run1', 1, 'watching'), executionId: 'run1', attempt: 1, eventType: 'automation.alert.watching', metadata: '{"deadline":1}' });
  await reconcileExpiredAttempts(40000); await reconcileExpiredAttempts(50000);
  expect(mockSend.mock.calls.filter(([command]) => command.input.Destination)).toHaveLength(1);
  const email = mockSend.mock.calls.find(([command]) => command.input.Destination)[0].input;
  expect(email.Content.Simple.Body.Text.Data).toContain('watchdog');
  expect(email.Content.Simple.Subject.Data).toBe('שגיאה באוטומציה — Example');
  expect(loader.loadDefinition).not.toHaveBeenCalled();
});

test('storage/configuration failure is isolated from the original error', async () => {
  prisma.execution.findUnique.mockRejectedValueOnce(new Error('database down'));
  expect(await notifyExecutionFailure('run1', new Error('original'))).toEqual({ status: 'failed' });
  expect(mockSend).not.toHaveBeenCalled();
});
