import assert from 'node:assert/strict';
import test from 'node:test';
import adapter from '../../../src/integrations/tuf1/priority-quote-whatsapp/failure-notification.js';
import definition from '../../../src/integrations/tuf1/priority-quote-whatsapp/integration.js';
import { _diagnostics } from '../src/lambda.js';

test('notification recipients accept commas, normalize and deduplicate; blank disables', () => {
  assert.deepEqual(adapter.resolveRecipients(' Ops@Example.com, support@example.com, ops@example.com '), ['ops@example.com', 'support@example.com']);
  for (const value of ['', '  ', undefined, null]) assert.deepEqual(adapter.resolveRecipients(value), []);
  const pattern = new RegExp(definition.credentials.find((field) => field.key === adapter.recipientsKey).validation.pattern);
  for (const value of ['bad', 'ok@example.com,', 'ok@example.com,,other@example.com', 'ok@example.com;other@example.com', 'Name <ok@example.com>']) {
    assert.throws(() => adapter.resolveRecipients(value), /valid email/);
    assert.equal(pattern.test(value), false);
  }
  assert.equal(pattern.test(''), true);
});

test('English email includes every supplied log across attempts without truncation', () => {
  const logs = Array.from({ length: 1250 }, (_, i) => ({
    createdAt: '2026-11-11T12:00:00Z', level: 'info', attempt: i < 1000 ? 1 : 2,
    message: `Entry ${i}`, metadata: { value: 'x'.repeat(180) },
  }));
  logs.push({ createdAt: '2026-11-11T12:01:00Z', level: 'error', attempt: 2,
    message: 'Priority failed', metadata: { status: 'retrying', providerError: { stage: 'login' } } });
  const result = adapter.buildMessage({ execution: { id: 'run-1', executionMode: 'live', startedAt: '2026-11-11T11:59:00Z' },
    attempt: 2, stage: 'worker', error: { message: 'Priority unavailable' }, logs, through: '2026-11-11T12:02:00Z' });
  assert.match(result.subject, /Run run-1 \| Attempt 2/);
  assert.match(result.text, /Failed stage: login/);
  assert.match(result.text, /A retry is scheduled/);
  assert.match(result.text, /Priority unavailable/);
  assert.match(result.text, /2026-11-11T11:59:00.000Z/);
  for (let i = 0; i < 1250; i++) assert.ok(result.text.includes(`Entry ${i}\n`));
  assert.ok(result.text.includes('x'.repeat(180)));
});

function telemetryRuntime(extra = {}) {
  const requests = [];
  return { requests, runtime: {
    reportStatus: async () => ({ accepted: true }),
    resolveConfig: async () => ({ credentials: {} }),
    telemetryOptions: { env: { AUTOMATION_WORKER_CALLBACK_TOKEN: 'test-only' }, fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true };
    } },
    ...extra,
  } };
}
const job = { id: 'legacy-id', executionId: 'run-1', integrationId: 'integration-1', mode: 'test', statusCallbackUrl: 'https://example.test/api/internal/integration-executions/run-1/status' };
const eventFor = (value, attempt = 1) => ({ Records: [{ body: JSON.stringify(value), messageId: 'record-1', attributes: { ApproximateReceiveCount: String(attempt) } }] });

test('Lambda registers before config, flushes logs before alert, preserves retry', async () => {
  const state = telemetryRuntime({ resolveConfig: async () => {
    assert.equal(state.requests[0].phase, 'start');
    throw Object.assign(new Error('Configuration unavailable'), { retryable: true });
  } });
  const result = await _diagnostics.handleEvent(eventFor(job, 2), () => state.runtime, { getRemainingTimeInMillis: () => 42000 });
  assert.deepEqual(result.batchItemFailures, [{ itemIdentifier: 'record-1' }]);
  assert.equal(state.requests[0].timeoutMs, 42000);
  assert.ok(state.requests.every((request) => request.attempt === 2));
  const entries = state.requests.filter((request) => request.phase === 'logs').flatMap((request) => request.entries);
  assert.ok(entries.some((entry) => entry.message.includes('started')));
  assert.ok(entries.some((entry) => entry.level === 'error'));
  assert.equal(state.requests.at(-1).phase, 'finish');
  assert.equal(state.requests.at(-1).errorMessage, 'Configuration unavailable');
});

test('returned ambiguous failure sends telemetry failure without retrying ITC', async () => {
  let businessCalls = 0;
  const state = telemetryRuntime({ finalizationStore: { load: async () => ({ state: 'IN_FLIGHT' }) },
    runIntegration: async () => { businessCalls++; } });
  const result = await _diagnostics.handleEvent(eventFor({ ...job, mode: 'live' }), () => state.runtime);
  assert.equal(result.results[0].ambiguousDelivery, true);
  assert.equal(businessCalls, 0);
  assert.deepEqual(result.batchItemFailures, []);
  assert.match(state.requests.at(-1).errorMessage, /previous worker stopped/);
});

test('successful execution reports completion without a failure notification', async () => {
  const state = telemetryRuntime({ runIntegration: async () => ({ success: true }) });
  const result = await _diagnostics.handleEvent(eventFor(job), () => state.runtime);
  assert.equal(result.results[0].success, true);
  assert.equal(state.requests.at(-1).phase, 'finish');
  assert.equal(state.requests.at(-1).errorMessage, undefined);
});
