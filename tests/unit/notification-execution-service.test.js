jest.mock('../../src/db/client', () => ({ execution: { update: jest.fn() } }));
jest.mock('../../src/core/sendgrid', () => ({ getConfig: jest.fn(), send: jest.fn() }));
const prisma = require('../../src/db/client');
const sendgrid = require('../../src/core/sendgrid');
const { markFailed } = require('../../src/core/execution-service');

test('failure persistence does not send a second, global SendGrid notification', async () => {
  prisma.execution.update.mockResolvedValue({ id: 'run', status: 'failed' });
  expect(await markFailed('run', 'failure')).toEqual({ id: 'run', status: 'failed' });
  expect(sendgrid.getConfig).not.toHaveBeenCalled();
  expect(sendgrid.send).not.toHaveBeenCalled();
});
