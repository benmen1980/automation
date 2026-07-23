import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfig } from '@automation/shared';
import { handler as lambdaHandler, _diagnostics as lambdaDiagnostics } from '../src/lambda.js';

test('resolves dashboard settings plus an integration-scoped Secrets Manager reference', async () => {
  const reads = [];
  const config = await resolveConfig({
    integrationId: 'int-1',
    executionMode: 'live',
    settings: { credentials: { PRIORITY_WEB_SDK_LANGUAGE: 3 } },
    credentialReferences: {
      ITC_BEARER_TOKEN: 'automation/int-1/ITC_BEARER_TOKEN',
      PRIORITY_WEB_SDK_PASSWORD: 'automation/int-1/PRIORITY_WEB_SDK_PASSWORD',
    },
  }, {
    env: {},
    readSecret: async (reference) => {
      reads.push(reference);
      return 'resolved-test-secret';
    },
  });

  assert.deepEqual(reads, [
    'automation/int-1/ITC_BEARER_TOKEN',
    'automation/int-1/PRIORITY_WEB_SDK_PASSWORD',
  ]);
  assert.equal(config.credentials.PRIORITY_WEB_SDK_LANGUAGE, 3);
  assert.equal(config.credentials.ITC_BEARER_TOKEN, 'resolved-test-secret');
  assert.equal(config.credentials.PRIORITY_WEB_SDK_PASSWORD, 'resolved-test-secret');
});

test('rejects a secret reference outside the current integration scope', async () => {
  await assert.rejects(
    resolveConfig({
      integrationId: 'int-1',
      credentialReferences: { ITC_BEARER_TOKEN: 'automation/another-integration/ITC_BEARER_TOKEN' },
    }, { env: {}, readSecret: async () => 'must-not-load' }),
    /not scoped to this integration/
  );
});

test('rejects malformed Secrets Manager name and ARN lookalikes without reading them', async () => {
  for (const reference of [
    'not-an-arn:secret:automation/int-1/ITC_BEARER_TOKEN',
    'automation/int-1/ITC_BEARER_TOKEN\nplaintext-tail',
    'arn:aws:secretsmanager:eu-west-1:123456789012:secret:automation/int-1/ITC_BEARER_TOKEN-bad',
  ]) {
    let reads = 0;
    await assert.rejects(
      resolveConfig({
        integrationId: 'int-1',
        credentialReferences: { ITC_BEARER_TOKEN: reference },
      }, {
        env: {},
        readSecret: async () => {
          reads += 1;
          return 'must-not-load';
        },
      }),
      /not scoped to this integration/
    );
    assert.equal(reads, 0);
  }
});

test('accepts a complete integration-scoped Secrets Manager ARN', async () => {
  const reference = 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:automation/int-1/ITC_BEARER_TOKEN-Ab12Cd';
  const config = await resolveConfig({
    integrationId: 'int-1',
    credentialReferences: { ITC_BEARER_TOKEN: reference },
  }, { env: {}, readSecret: async (value) => value === reference ? 'resolved' : 'wrong' });

  assert.equal(config.credentials.ITC_BEARER_TOKEN, 'resolved');
});

test('Lambda path emits explicit running and success lifecycle records', async () => {
  const entries = [];
  const originalLog = console.log;
  console.log = (line) => entries.push(JSON.parse(line));
  try {
    const response = await lambdaHandler({
      id: 'job-lifecycle-1',
      integrationId: 'int-1',
      integrationName: 'Priority Customer Order to ITC',
      executionMode: 'test',
      triggerType: 'manual',
      credentials: {
        ITC_TEMPLATE_MESSAGE_URL: 'https://itc.example.test/template/1',
        ITC_BEARER_TOKEN: 'local-test-only',
        ITC_CHANNEL_ID: 'whatsapp:+97246960480',
        PRIORITY_WEB_SDK_ORDER_SORT_OPTION: 'By Order Number',
      },
      payload: {
        ORDERS: { ORDNAME: 'SO26000001', ZANA_CUSTDES: 'Jordan', ZANA_PHONENUM: '0507573753' },
      },
    });
    assert.equal(response.success, true);
  } finally {
    console.log = originalLog;
  }

  const started = entries.find((entry) => entry.metadata?.status === 'running');
  const finished = entries.find((entry) => entry.metadata?.status === 'success' && entry.metadata?.finishedAt);
  assert.ok(started?.metadata?.startedAt);
  assert.ok(finished);
  assert.equal(JSON.stringify(entries).includes('SO26000001'), false);
  assert.equal(JSON.stringify(entries).includes('local-test-only'), false);
});

function memoryFinalizationStore() {
  let value = null;
  return {
    async load() { return value; },
    async saveInFlight(_executionId, startedAt) { value = { state: 'IN_FLIGHT', startedAt }; },
    async saveSuccess(_executionId, result, finishedAt) { value = { state: 'SUCCESS', result, finishedAt }; },
    async saveFailure(_executionId, errorMessage, finishedAt) { value = { state: 'FAILED', errorMessage, finishedAt }; },
    set(valueToStore) { value = valueToStore; },
    get() { return value; },
  };
}

function liveJob() {
  return {
    id: 'exec-finalize-1',
    integrationId: 'int-1',
    executionMode: 'live',
    triggerType: 'webhook',
    payload: { ORDERS: { ORDNAME: 'SO1', ZANA_CUSTDES: 'Jordan', ZANA_PHONENUM: '0507573753' } },
  };
}

test('success callback retry finalizes from durable state without sending ITC twice', async () => {
  const store = memoryFinalizationStore();
  let sends = 0;
  let failSuccessCallback = true;
  const reportStatus = async (_job, status) => {
    if (status === 'running') return { accepted: true };
    if (status === 'success' && failSuccessCallback) {
      failSuccessCallback = false;
      throw new Error('temporary callback outage');
    }
    return { accepted: true };
  };
  const runtime = {
    finalizationStore: store,
    reportStatus,
    resolveConfig: async () => ({ credentials: {} }),
    runIntegration: async (_job, context) => {
      await context.beforeProviderDelivery();
      sends += 1;
      return { success: true, providerMessageId: 'itc-1', counts: { recordsRead: 1, messagesSent: 1, errors: 0 } };
    },
  };

  await assert.rejects(lambdaDiagnostics.processJob(liveJob(), 'record-1', runtime), /callback outage/);
  const result = await lambdaDiagnostics.processJob(liveJob(), 'record-1', { ...runtime, attemptNumber: 2 });
  assert.equal(result.success, true);
  assert.equal(sends, 1);
});

test('failed callback retry finalizes a terminal provider failure without rerunning ITC', async () => {
  const store = memoryFinalizationStore();
  let attempts = 0;
  let failFailureCallback = true;
  const reportStatus = async (_job, status) => {
    if (status === 'running') return { accepted: true };
    if (status === 'failed' && failFailureCallback) {
      failFailureCallback = false;
      throw new Error('temporary callback outage');
    }
    return { accepted: true };
  };
  const terminalError = new Error('ITC rejected the request.');
  terminalError.providerError = { httpStatus: 400 };
  const runtime = {
    finalizationStore: store,
    reportStatus,
    resolveConfig: async () => ({ credentials: {} }),
    runIntegration: async (_job, context) => {
      await context.beforeProviderDelivery();
      attempts += 1;
      throw terminalError;
    },
  };

  await assert.rejects(lambdaDiagnostics.processJob(liveJob(), 'record-1', runtime), /callback outage/);
  const result = await lambdaDiagnostics.processJob(liveJob(), 'record-1', { ...runtime, attemptNumber: 2 });
  assert.equal(result.terminalFailure, true);
  assert.equal(attempts, 1);
});

test('an IN_FLIGHT marker from a crashed attempt blocks automatic ITC resend', async () => {
  const store = memoryFinalizationStore();
  store.set({ state: 'IN_FLIGHT', startedAt: '2026-07-21T00:00:00.000Z' });
  let sends = 0;
  const statuses = [];
  const result = await lambdaDiagnostics.processJob(liveJob(), 'record-1', {
    attemptNumber: 2,
    finalizationStore: store,
    reportStatus: async (_job, status, details) => {
      statuses.push({ status, details });
      return { accepted: true };
    },
    resolveConfig: async () => ({ credentials: {} }),
    runIntegration: async () => {
      sends += 1;
      return { success: true };
    },
  });

  assert.equal(result.ambiguousDelivery, true);
  assert.equal(result.automaticResendSuppressed, true);
  assert.equal(sends, 0);
  assert.equal(statuses.some(({ status }) => status === 'failed'), true);
});

test('ITC HTTP 5xx is ambiguous and is not automatically retried without provider idempotency', () => {
  const error = new Error('ITC template message API failed with HTTP 503.');
  error.providerError = { api: 'ITC template message API', httpStatus: 503 };
  assert.equal(lambdaDiagnostics.shouldRetry(error), false);
});

test('the final safe retry attempt stores FAILED and updates the dashboard before DLQ transfer', async () => {
  const store = memoryFinalizationStore();
  const statuses = [];
  let attempts = 0;
  const retryableError = new Error('Priority Web SDK temporarily unavailable.');
  retryableError.retryable = true;
  retryableError.providerError = { api: 'Priority Web SDK' };

  await assert.rejects(lambdaDiagnostics.processJob(liveJob(), 'record-1', {
    attemptNumber: 3,
    maxReceiveCount: 3,
    finalizationStore: store,
    reportStatus: async (_job, status, details) => {
      statuses.push({ status, details });
      return { accepted: true };
    },
    resolveConfig: async () => ({ credentials: {} }),
    runIntegration: async () => {
      attempts += 1;
      throw retryableError;
    },
  }), /temporarily unavailable/);

  assert.equal(attempts, 1);
  assert.equal(store.get().state, 'FAILED');
  assert.equal(statuses.some(({ status }) => status === 'failed'), true);
  assert.equal(retryableError.retryable, false);
  assert.equal(retryableError.sendToDlq, true);
});

test('the SQS handler returns a terminalized third-attempt failure for DLQ transfer', async () => {
  const store = memoryFinalizationStore();
  const retryableError = new Error('Priority Web SDK temporarily unavailable.');
  retryableError.retryable = true;
  retryableError.providerError = { api: 'Priority Web SDK' };
  const event = {
    Records: [{
      messageId: 'sqs-record-final-attempt',
      attributes: { ApproximateReceiveCount: '3' },
      body: JSON.stringify(liveJob()),
    }],
  };

  const response = await lambdaDiagnostics.handleEvent(event, () => ({
    maxReceiveCount: 3,
    finalizationStore: store,
    reportStatus: async () => ({ accepted: true }),
    resolveConfig: async () => ({ credentials: {} }),
    runIntegration: async () => {
      throw retryableError;
    },
  }));

  assert.deepEqual(response.batchItemFailures, [{ itemIdentifier: 'sqs-record-final-attempt' }]);
  assert.equal(response.results[0].retryable, false);
  assert.equal(response.results[0].sendToDlq, true);
  assert.equal(store.get().state, 'FAILED');
});
