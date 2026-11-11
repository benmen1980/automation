import test from 'node:test';
import assert from 'node:assert/strict';
import { withExecutionTelemetry } from '../../packages/shared/src/executionTelemetry.js';
import { createLogger } from '../../packages/shared/src/logger.js';

test('flushes full sanitized logs before finish, and preserves the original thrown error', async () => {
  const calls = [];
  const error = new Error('business failure');
  const job = { id: 'run1', integrationId: 'int1', statusCallbackUrl: 'https://example.test/run1/status' };
  await assert.rejects(withExecutionTelemetry(job, {
    attempt: 2, timeoutMs: 1000, env: { AUTOMATION_WORKER_CALLBACK_TOKEN: 'test' },
    fetchImpl: async (_url, options) => { calls.push(JSON.parse(options.body)); return { ok: true }; },
  }, async () => {
    createLogger({ jobId: 'run1' }).error('Failure', { detail: 'x'.repeat(300), password: 'hidden' });
    createLogger({ jobId: 'other' }).info('Other run');
    throw error;
  }), (err) => err === error);
  assert.equal(calls.at(-1).phase, 'finish');
  assert.equal(calls.at(-1).errorMessage, 'business failure');
  const entries = calls.filter((c) => c.phase === 'logs').flatMap((c) => c.entries);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].metadata.detail.length, 300);
  assert.equal(entries[0].metadata.password, '***REDACTED***');
  assert.equal(calls[0].attempt, 2);
});

test('transport failure cannot replace business error or repeat its execution', async () => {
  const calls = []; let runs = 0;
  const error = new Error('original');
  await assert.rejects(withExecutionTelemetry({ id: 'r', integrationId: 'i', statusCallbackUrl: 'https://example.test/r/status' }, {
    attempt: 1, timeoutMs: 1000, env: { AUTOMATION_WORKER_CALLBACK_TOKEN: 'test' },
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); if (body.phase === 'logs') throw new Error('offline'); return { ok: true }; },
  }, async () => { runs++; createLogger({ jobId: 'r' }).error('error'); throw error; }), (err) => err === error);
  assert.equal(runs, 1);
  assert.equal(calls.some((c) => c.phase === 'finish'), false);
});
