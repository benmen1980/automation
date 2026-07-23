describe('queue SQS mode', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      QUEUE_MODE: 'sqs',
      SQS_QUEUE_URL_INT_4D6A8C2F9E1B7350: 'https://sqs.test/echo-fixture',
      INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL: 'https://automation.example.test',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.dontMock('../../src/core/execution-service');
    jest.dontMock('@aws-sdk/client-sqs');
  });

  test('publishes only safe settings and scoped secret references, then marks the execution queued', async () => {
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
        integration: {
          id: 'int-1',
          slug: 'gmail-priority',
          name: 'Gmail Priority',
          codeFolder: 'src/integrations/test_fixtures/echo',
          credentials: [
            { key: 'GREETING', valueReference: JSON.stringify('Hello from queue'), isSecret: false },
            { key: 'API_TOKEN', valueReference: 'automation/int-1/API_TOKEN', isSecret: true },
            { key: 'OBSOLETE_PASSWORD', valueReference: 'automation/int-1/OBSOLETE_PASSWORD', isSecret: true },
          ],
        },
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
      queueUrl: 'https://sqs.test/echo-fixture',
    });
    expect(message).toMatchObject({
      schemaVersion: 2,
      jobType: 'integration-execution',
      executionId: 'exec-1',
      id: 'exec-1',
      integrationSlug: 'gmail-priority',
      integrationKey: 'int_4d6a8c2f9e1b7350',
      userSlug: 'user_001',
      mode: 'test',
      payload: { email: 'lead@example.test', body: 'Need SKU-1' },
      credentialReferences: { API_TOKEN: 'automation/int-1/API_TOKEN' },
      settings: { credentials: { GREETING: 'Hello from queue' } },
      statusCallbackUrl: 'https://automation.example.test/api/internal/integration-executions/exec-1/status',
    });
    expect(JSON.stringify(message)).not.toContain('fixture-secret-value');
    expect(JSON.stringify(message)).not.toContain('OBSOLETE_PASSWORD');
    expect(getExecutionById).not.toHaveBeenCalled();
  });

  test('fails closed when a manifest secret is misclassified as non-secret in storage', () => {
    const { buildSqsJobMessage } = require('../../src/core/queue');
    const execution = {
      id: 'exec-secret-mismatch',
      userId: 'user-1',
      integrationId: 'int-1',
      triggerType: 'manual',
      executionMode: 'live',
      inputPayload: '{}',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      integration: {
        id: 'int-1',
        slug: 'echo-fixture',
        name: 'Test Echo',
        codeFolder: 'src/integrations/test_fixtures/echo',
        credentials: [
          {
            key: 'API_TOKEN',
            valueReference: JSON.stringify('must-never-enter-sqs'),
            isSecret: false,
          },
        ],
      },
      user: { id: 'user-1', slug: 'user_001' },
    };

    expect(() => buildSqsJobMessage(execution, {
      INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL: 'https://automation.example.test',
    })).toThrow('Credential storage classification mismatch for API_TOKEN');
  });

  test('fails closed before serialization for plaintext and malformed secret-reference lookalikes', () => {
    const { buildSqsJobMessage } = require('../../src/core/queue');
    const serializationSpy = jest.spyOn(JSON, 'stringify');
    const baseExecution = {
      id: 'exec-plaintext-secret',
      userId: 'user-1',
      integrationId: 'int-1',
      triggerType: 'manual',
      executionMode: 'live',
      inputPayload: '{}',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      integration: {
        id: 'int-1',
        slug: 'echo-fixture',
        name: 'Test Echo',
        codeFolder: 'src/integrations/test_fixtures/echo',
        credentials: [],
      },
      user: { id: 'user-1', slug: 'user_001' },
    };

    try {
      for (const valueReference of [
        'actual-super-secret-value',
        'not-an-arn:secret:automation/int-1/API_TOKEN',
        'automation/int-1/API_TOKEN\nplaintext-tail',
        'arn:aws:secretsmanager:eu-west-1:123456789012:secret:automation/int-1/API_TOKEN-bad',
      ]) {
        const execution = {
          ...baseExecution,
          integration: {
            ...baseExecution.integration,
            credentials: [{ key: 'API_TOKEN', valueReference, isSecret: true }],
          },
        };
        expect(() => buildSqsJobMessage(execution, {
          INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL: 'https://automation.example.test',
        })).toThrow('Secret reference for API_TOKEN is invalid or outside this integration');
      }
      expect(serializationSpy).not.toHaveBeenCalledWith(expect.objectContaining({
        credentialReferences: expect.any(Object),
      }));
    } finally {
      serializationSpy.mockRestore();
    }
  });
});
