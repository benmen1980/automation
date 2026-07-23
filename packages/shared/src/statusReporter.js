import { readSecretByReference } from './configLoader.js';

const ALLOWED_STATUSES = new Set(['running', 'retrying', 'success', 'failed']);

export async function reportExecutionStatus(job, status, details = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!ALLOWED_STATUSES.has(status)) throw new Error(`Unsupported worker execution status: ${status}.`);
  if (!job.statusCallbackUrl) return { accepted: true, localOnly: true };

  let token = String(env.AUTOMATION_WORKER_CALLBACK_TOKEN || '').trim();
  if (!token && env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID) {
    token = String(await readSecretByReference(env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID, env)).trim();
  }
  if (!token) throw new Error('AUTOMATION_WORKER_CALLBACK_TOKEN is required for worker status callbacks.');

  const response = await fetchImpl(job.statusCallbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      integrationId: job.integrationId,
      status,
      ...details,
    }),
  });

  let responseBody = {};
  try {
    responseBody = await response.json();
  } catch {
    responseBody = {};
  }
  if (!response.ok) {
    throw new Error(`Execution status callback failed with HTTP ${response.status}.`);
  }
  return responseBody;
}
