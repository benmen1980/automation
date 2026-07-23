const { canonicalizeExecutionPayload, redactPayload, redactExecutionForDisplay } = require('../../src/core/execution-privacy');
const definition = require('../../src/integrations/tuf1/priority-quote-whatsapp/integration');

describe('execution payload privacy', () => {
  const payload = {
    ORDERS: {
      ORDNAME: 'SO26000001',
      ZANA_CUSTDES: 'ירדן',
      ZANA_PHONENUM: '+972507573753',
    },
  };

  test('redacts configured execution fields without mutating the stored payload object', () => {
    const safe = redactPayload(definition, payload);

    expect(safe).toEqual({
      ORDERS: {
        ORDNAME: { type: 'redacted', reason: 'sensitive personal data' },
        ZANA_CUSTDES: 'ירדן',
        ZANA_PHONENUM: { type: 'redacted', reason: 'sensitive personal data' },
      },
    });
    expect(payload.ORDERS.ORDNAME).toBe('SO26000001');
    expect(payload.ORDERS.ZANA_PHONENUM).toBe('+972507573753');
  });

  test('redacts API execution input while preserving non-sensitive fields', () => {
    const integration = {
      id: 'cmrtomudr0001105jk8e1spo6',
      codeFolder: 'src/integrations/tuf1/priority-quote-whatsapp',
      definitionFile: 'integration.js',
    };
    const execution = { id: 'execution-1', inputPayload: JSON.stringify(payload), status: 'success' };

    const safeExecution = redactExecutionForDisplay(integration, execution);
    const safePayload = JSON.parse(safeExecution.inputPayload);

    expect(safePayload.ORDERS.ORDNAME).toMatchObject({ type: 'redacted' });
    expect(safePayload.ORDERS.ZANA_PHONENUM).toMatchObject({ type: 'redacted' });
    expect(safePayload.ORDERS.ZANA_CUSTDES).toBe('ירדן');
    expect(execution.inputPayload).toContain('SO26000001');
  });

  test('canonicalizes ITC execution input to the three declared order fields', () => {
    const unsafePayload = {
      apiToken: 'must-not-persist',
      ORDERS: {
        ...payload.ORDERS,
        CUSTOMER_EMAIL: 'private@example.test',
        password: 'must-not-persist',
        ADDRESS: 'must-not-persist',
      },
    };

    const canonical = canonicalizeExecutionPayload(definition, unsafePayload);

    expect(canonical).toEqual(payload);
    expect(JSON.stringify(canonical)).not.toContain('must-not-persist');
    expect(JSON.stringify(canonical)).not.toContain('private@example.test');
  });
});
