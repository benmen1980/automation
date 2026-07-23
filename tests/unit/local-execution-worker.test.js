const {
  createTrackedLogger,
  INDEPENDENT_LOCAL_WORKERS,
} = require('../../src/workers/local-execution-worker');

describe('independent local integration worker support', () => {
  test('routes the target automation by stable owner and slug', () => {
    expect(INDEPENDENT_LOCAL_WORKERS.get('tuf1/priority-quote-whatsapp')).toBe(
      'priority-order-itc'
    );
  });

  test('captures an ignored async logging rejection until deterministic flush', async () => {
    const logger = {
      info: jest.fn(() => Promise.reject(new Error('database log write failed'))),
    };
    const tracked = createTrackedLogger(logger);

    tracked.info('A handler does not await this call.');
    await Promise.resolve();

    await expect(tracked.flush()).rejects.toMatchObject({
      name: 'IntegrationLogFlushError',
      message: 'One or more integration log entries could not be persisted.',
    });
  });

  test('flush succeeds when all tracked log writes succeed', async () => {
    const logger = {
      info: jest.fn(() => Promise.resolve()),
      error: jest.fn(() => Promise.resolve()),
    };
    const tracked = createTrackedLogger(logger);

    tracked.info('started');
    tracked.error('example');

    await expect(tracked.flush()).resolves.toBeUndefined();
  });

  test('preserves the provider error and finalizes failure when handler and log writes fail', async () => {
    const providerError = new Error(
      'Priority Web SDK failed during Sort selection: Sort is mandatory.'
    );
    providerError.providerError = {
      stage: 'sort-selection',
      explanation: 'Priority rejected the required Sort field.',
    };
    const logger = {
      info: jest
        .fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('database log write failed')),
      error: jest.fn(() => Promise.resolve()),
    };
    const executionStore = {
      markRunning: jest.fn(() => Promise.resolve()),
      markSuccess: jest.fn(() => Promise.resolve()),
      markFailed: jest.fn(() => Promise.resolve()),
      getExecutionById: jest.fn(() =>
        Promise.resolve({ id: 'execution-1', status: 'failed' })
      ),
    };
    const execution = {
      id: 'execution-1',
      userId: 'user-1',
      integrationId: 'integration-1',
      triggerType: 'manual',
      executionMode: 'test',
      inputPayload: JSON.stringify({
        ORDERS: {
          ORDNAME: 'SO-REDACTED',
          ZANA_CUSTDES: 'Customer',
          ZANA_PHONENUM: '+972500000000',
        },
      }),
      integration: {
        id: 'integration-1',
        name: 'Priority order confirmation to ITC',
        slug: 'priority-quote-whatsapp',
      },
      user: { id: 'user-1', slug: 'tuf1' },
    };
    const handler = jest.fn(async (_job, context) => {
      context.logger.info('This tracked log write will fail.');
      throw providerError;
    });

    await expect(
      require('../../src/workers/local-execution-worker').runIndependentLocalWorker(
        execution,
        'priority-order-itc',
        {
          credentials: {},
          executionService: executionStore,
          handler,
          logger,
        }
      )
    ).resolves.toMatchObject({ status: 'failed' });

    expect(executionStore.markSuccess).not.toHaveBeenCalled();
    expect(executionStore.markFailed).toHaveBeenCalledWith(
      'execution-1',
      providerError.message
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Independent local integration worker failed.',
      expect.objectContaining({
        error: providerError.message,
        providerError: providerError.providerError,
        logPersistenceError: {
          name: 'IntegrationLogFlushError',
          message: 'One or more integration log entries could not be persisted.',
        },
        status: 'failed',
      })
    );
  });
});
