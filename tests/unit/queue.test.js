describe('queue SQS mode', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, QUEUE_MODE: 'sqs', SQS_QUEUE_URL_GMAIL_PRIORITY: 'https://sqs.test/gmail-priority' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.dontMock('../../src/core/execution-service');
    jest.dontMock('@aws-sdk/client-sqs');
  });

  test('publishes an execution job without credentials and marks it queued', async () => {
    const send = jest.fn(async () => ({ MessageId: 'msg-123' }));
    class SendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    class SQSClient {
      send(command) {
        return send(command);
      }
    }

    const markQueued = jest.fn(async (executionId, metadata) => ({
      id: executionId,
      status: 'queued',
      queueMessageId: metadata.messageId,
      queueUrl: metadata.queueUrl,
    }));

    jest.doMock('@aws-sdk/client-sqs', () => ({ SQSClient, SendMessageCommand }));
    const getExecutionById = jest.fn();
    jest.doMock('../../src/core/execution-service', () => ({
      getExecutionForQueue: jest.fn(async () => ({
        id: 'exec-1',
        userId: 'user-1',
        integrationId: 'int-1',
        triggerType: 'manual',
        executionMode: 'test',
        inputPayload: JSON.stringify({ email: 'lead@example.test', body: 'Need SKU-1' }),
        createdAt: new Date('2026-06-28T00:00:00.000Z'),
        integration: { id: 'int-1', slug: 'gmail-priority', name: 'Gmail Priority' },
        user: { id: 'user-1', slug: 'user_001', email: 'user@example.test' },
      })),
      markQueued,
      getExecutionById,
      markFailed: jest.fn(),
    }));

    const { enqueueExecution } = require('../../src/core/queue');
    const queued = await enqueueExecution('exec-1', { wait: true });
    const message = JSON.parse(send.mock.calls[0][0].input.MessageBody);

    expect(queued.status).toBe('queued');
    expect(markQueued).toHaveBeenCalledWith('exec-1', {
      messageId: 'msg-123',
      queueUrl: 'https://sqs.test/gmail-priority',
    });
    expect(message).toMatchObject({
      schemaVersion: 1,
      jobType: 'integration-execution',
      executionId: 'exec-1',
      id: 'exec-1',
      integrationSlug: 'gmail-priority',
      userSlug: 'user_001',
      mode: 'test',
      payload: { email: 'lead@example.test', body: 'Need SKU-1' },
    });
    expect(JSON.stringify(message)).not.toMatch(/secret|token|password|credential/i);
    expect(getExecutionById).not.toHaveBeenCalled();
  });
});
