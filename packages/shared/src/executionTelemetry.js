import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { readSecretByReference } from './configLoader.js';

export const executionTelemetry = new AsyncLocalStorage();

// Wrap the WHOLE worker invocation, before loading settings or business code.
// Log transport failures never change the business result or trigger its retry.
export async function withExecutionTelemetry(job, { attempt, timeoutMs, env = process.env, fetchImpl = globalThis.fetch }, run) {
  const entries = [];
  let chain = Promise.resolve();
  let transportError;
  async function request(body) {
    let token = env.AUTOMATION_WORKER_CALLBACK_TOKEN;
    if (!token && env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID) {
      token = await readSecretByReference(env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID, env);
    }
    if (!token || !job.statusCallbackUrl) throw new Error('Telemetry callback is not configured.');
    const response = await fetchImpl(job.statusCallbackUrl.replace(/\/status$/, '/telemetry'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ integrationId: job.integrationId, attempt, ...body }),
    });
    if (!response.ok) throw new Error(`Telemetry callback HTTP ${response.status}.`);
  }
  const flush = () => {
    chain = chain.catch(() => {}).then(async () => {
      while (entries.length) {
        const batch = entries.slice(0, 50);
        await request({ phase: 'logs', entries: batch });
        entries.splice(0, batch.length);
      }
      transportError = null;
    }).catch((error) => { transportError = error; });
    return chain;
  };
  const context = { jobId: job.executionId || job.id, attempt,
    capture(entry) { entries.push({ ...entry, id: randomUUID() }); void flush(); } };
  await request({ phase: 'start', timeoutMs }).catch((err) => { transportError = err; });
  return executionTelemetry.run(context, async () => {
    let failure;
    try { return await run(); }
    catch (err) { failure = err; throw err; }
    finally {
      await flush();
      // Never declare a complete snapshot if log persistence failed. The external
      // watchdog reports the missing acknowledgement instead of sending partial logs.
      if (!transportError) await request({ phase: 'finish', errorMessage: failure?.message }).catch(() => {});
    }
  });
}
