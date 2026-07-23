jest.mock('../../src/core/execution-service', () => ({
  createExecution: jest.fn(),
}));
jest.mock('../../src/core/queue', () => ({
  enqueueExecution: jest.fn(),
}));
jest.mock('../../src/core/integration-loader', () => ({
  loadDefinition: jest.fn(),
}));

const executionService = require('../../src/core/execution-service');
const { enqueueExecution } = require('../../src/core/queue');
const integrationLoader = require('../../src/core/integration-loader');
const { createAndEnqueue } = require('../../src/core/manual-runner');

describe('manual runner execution boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    integrationLoader.loadDefinition.mockReturnValue({
      testing: { modes: ['dry_run', 'test', 'mock_output', 'live'] },
      privacy: {
        executionPayloadAllowlistPaths: [
          'ORDERS.ORDNAME',
          'ORDERS.ZANA_CUSTDES',
          'ORDERS.ZANA_PHONENUM',
        ],
      },
    });
    executionService.createExecution.mockResolvedValue({ id: 'execution-1' });
    enqueueExecution.mockResolvedValue({ id: 'execution-1', status: 'queued' });
  });

  test('strips unknown sensitive fields before persistence and queue publication', async () => {
    const integration = { id: 'integration-1', userId: 'user-1', codeFolder: 'fixture' };
    await createAndEnqueue({
      integration,
      triggerType: 'manual',
      executionMode: 'test',
      payload: {
        apiToken: 'must-not-persist',
        ORDERS: {
          ORDNAME: 'SO26000001',
          ZANA_CUSTDES: 'Jordan',
          ZANA_PHONENUM: '+972507573753',
          CUSTOMER_EMAIL: 'private@example.test',
          password: 'must-not-persist',
          ADDRESS: 'must-not-persist',
        },
      },
    });

    expect(executionService.createExecution).toHaveBeenCalledWith(expect.objectContaining({
      inputPayload: {
        ORDERS: {
          ORDNAME: 'SO26000001',
          ZANA_CUSTDES: 'Jordan',
          ZANA_PHONENUM: '+972507573753',
        },
      },
    }));
    expect(JSON.stringify(executionService.createExecution.mock.calls[0][0])).not.toContain('must-not-persist');
    expect(JSON.stringify(executionService.createExecution.mock.calls[0][0])).not.toContain('private@example.test');
    expect(enqueueExecution).toHaveBeenCalledWith('execution-1', { wait: true });
  });

  test('rejects an undeclared mode before persistence or queue publication', async () => {
    await expect(createAndEnqueue({
      integration: { id: 'integration-1', userId: 'user-1', codeFolder: 'fixture' },
      triggerType: 'manual',
      executionMode: 'typo',
      payload: {},
    })).rejects.toMatchObject({ statusCode: 400 });

    expect(executionService.createExecution).not.toHaveBeenCalled();
    expect(enqueueExecution).not.toHaveBeenCalled();
  });
});
