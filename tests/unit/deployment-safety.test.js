jest.mock('../../src/db/client', () => ({}));
jest.mock('../../src/core/secrets', () => ({}));
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const safety = require('../../src/core/deployment-safety');

test.each([
  ['recipientManagementEnabled', 'recipientManagementEnabled'],
  ['notificationEmailSendingEnabled', 'notificationEmailSendingEnabled'],
  ['verificationEmailsEnabled', 'verificationEmailsEnabled'],
  ['emailSendingEnabled', 'emailSendingEnabled'],
  ['schedulerEnabled', 'schedulerEnabled'],
  ['watchdogEnabled', 'watchdogEnabled'],
])('enabling %s does not enable any other capability', (key, accessor) => {
  const policy = require('../../config/deployment-safety.json');
  const original = { ...policy };
  try {
    policy[key] = true;
    for (const name of ['recipientManagementEnabled', 'notificationEmailSendingEnabled', 'verificationEmailsEnabled', 'emailSendingEnabled', 'schedulerEnabled', 'watchdogEnabled']) {
      expect(safety[name]()).toBe(name === accessor);
    }
  } finally { Object.assign(policy, original); }
});

test('this release disables database deployment changes, outbound email and background jobs', () => {
  expect(require('../../config/deployment-safety.json')).toEqual({
    databaseUpdatesEnabled: false, emailSendingEnabled: false,
    recipientManagementEnabled: false, notificationEmailSendingEnabled: false,
    verificationEmailsEnabled: false, schedulerEnabled: false, watchdogEnabled: false,
  });
  expect(safety.emailSendingEnabled()).toBe(false);
  expect(safety.schedulerEnabled()).toBe(false);
  expect(safety.watchdogEnabled()).toBe(false);
});

test('notification save/test/failure cannot write data, request verification or send mail', async () => {
  const unexpected = jest.fn(() => { throw new Error('Unexpected side effect'); });
  const db = { credential: { upsert: unexpected, findUnique: unexpected }, log: { create: unexpected } };
  const service = require('../../src/core/notification-recipients').createNotificationService({ db, ses: { send: unexpected }, verification: { send: unexpected } });
  const integration = { id: 'a', name: 'test' };
  await expect(service.save(integration, 'a@example.com')).rejects.toMatchObject({ code: 'RECIPIENT_MANAGEMENT_DISABLED' });
  await expect(service.test(integration)).rejects.toMatchObject({ code: 'EMAIL_SENDING_DISABLED' });
  expect(await service.notifyFailure(integration, new Error('failure'), { executionId: 'run', attempt: 1 })).toEqual({ status: 'disabled' });
  expect(await require('../../src/core/execution-alerts').notifyExecutionFailure('run', new Error('failure'))).toEqual({ status: 'disabled' });
  expect(unexpected).not.toHaveBeenCalled();
});

test('all platform outbound email providers reject before credentials or network access', async () => {
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected network call'));
  const calls = [
    () => require('../../src/core/sendgrid').send({}),
    () => require('../../src/connectors/email/real').send({}, {}),
    () => require('../../src/connectors/ses/real').sendEmail({}, {}),
    () => require('../../src/connectors/gmail/real').sendEmail({}, {}),
  ];
  try {
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: 'EMAIL_SENDING_DISABLED' });
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

test('deployment hook skips both schema push and integration data sync', () => {
  const hook = fs.readFileSync(path.resolve(__dirname, '../../.platform/hooks/predeploy/01_db_push.sh'), 'utf8');
  // Execute the actual guard; replace forbidden commands with fail-fast sentinels.
  const guard = hook.slice(hook.indexOf('if node -e'))
    .replace('node_modules/.bin/prisma db push', 'forbidden_database_write')
    .replace('node scripts/sync-integration-db.js', 'forbidden_database_write');
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const output = execFileSync(shell, ['-c', 'set -eu\nforbidden_database_write() { echo UNEXPECTED_WRITE; exit 99; }\n' + guard],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
  expect(output).toContain('database schema updates and integration sync skipped');
  expect(output).not.toContain('UNEXPECTED_WRITE');
});
