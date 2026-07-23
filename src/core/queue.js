const path = require('path');
const { spawn } = require('child_process');
const executionService = require('./execution-service');
const integrationLoader = require('./integration-loader');

const QUEUE_MODE = process.env.QUEUE_MODE || 'local';
const LOCAL_WORKER_TIMEOUT_MS = Number(process.env.LOCAL_WORKER_TIMEOUT_MS || 120000);

function queueEnvKeyForIntegration(integration) {
  return String(integration.slug || integration.id || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function resolveSqsQueueUrl(integration) {
  const slugKey = queueEnvKeyForIntegration(integration);
  const idKey = integration.id ? integration.id.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase() : '';
  const candidates = [
    idKey && `SQS_QUEUE_URL_${idKey}`,
    slugKey && `SQS_QUEUE_URL_${slugKey}`,
    'SQS_QUEUE_URL',
  ].filter(Boolean);

  for (const key of candidates) {
    if (process.env[key]) return { queueUrl: process.env[key], envKey: key };
  }

  const err = new Error(`No SQS queue URL configured for integration "${integration.slug}". Set SQS_QUEUE_URL_${slugKey} or SQS_QUEUE_URL.`);
  err.statusCode = 500;
  throw err;
}

function parseStoredSetting(valueReference) {
  try {
    return JSON.parse(valueReference);
  } catch {
    throw new Error('A saved non-secret worker setting is malformed. Save the integration settings again.');
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isScopedSecretReference(valueReference, integrationId, credentialKey) {
  const value = String(valueReference || '');
  const scopeComponent = /^[A-Za-z0-9_+=.@-]+$/;
  if (!scopeComponent.test(String(integrationId || '')) || !scopeComponent.test(String(credentialKey || ''))) {
    return false;
  }
  const expectedName = `automation/${integrationId}/${credentialKey}`;
  if (value === expectedName) return true;
  const arnPattern = new RegExp(
    `^arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:${escapeRegExp(expectedName)}-[A-Za-z0-9]{6}$`
  );
  return arnPattern.test(value);
}

function buildSqsJobMessage(execution, env = process.env) {
  const payload = execution.inputPayload ? JSON.parse(execution.inputPayload) : {};
  const rawCallbackBaseUrl = String(env.INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL || '').trim();
  if (!rawCallbackBaseUrl) {
    throw new Error('INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL is required when QUEUE_MODE=sqs.');
  }
  let parsedCallbackBaseUrl;
  try {
    parsedCallbackBaseUrl = new URL(rawCallbackBaseUrl);
  } catch {
    throw new Error('INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL must be a valid URL.');
  }
  const localCallback = ['localhost', '127.0.0.1', '::1'].includes(parsedCallbackBaseUrl.hostname);
  if (parsedCallbackBaseUrl.protocol !== 'https:' && !localCallback) {
    throw new Error('INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL must use HTTPS outside local development.');
  }
  const callbackBaseUrl = parsedCallbackBaseUrl.toString().replace(/\/+$/, '');
  const definition = integrationLoader.loadDefinition(execution.integration, { bypassCache: true });
  const credentialDefinitions = new Map((definition.credentials || []).map((field) => [field.key, field]));
  const credentialRows = (execution.integration.credentials || []).filter((row) => credentialDefinitions.has(row.key));
  const credentialReferences = {};
  const workerSettings = {};
  for (const row of credentialRows) {
    const field = credentialDefinitions.get(row.key);
    const manifestSecret = field.type === 'secret' || field.masked === true || field.isSecret === true;
    if (Boolean(row.isSecret) !== manifestSecret) {
      throw new Error(`Credential storage classification mismatch for ${row.key}. Re-save this integration credential before queueing a worker job.`);
    }
    if (manifestSecret) {
      if (!isScopedSecretReference(row.valueReference, execution.integrationId, row.key)) {
        throw new Error(`Secret reference for ${row.key} is invalid or outside this integration. Re-save this integration credential before queueing a worker job.`);
      }
      credentialReferences[row.key] = row.valueReference;
    } else {
      workerSettings[row.key] = parseStoredSetting(row.valueReference);
    }
  }
  return {
    schemaVersion: 2,
    jobType: 'integration-execution',
    id: execution.id,
    executionId: execution.id,
    integrationId: execution.integrationId,
    integrationSlug: execution.integration.slug,
    integrationName: execution.integration.name,
    userId: execution.userId,
    userSlug: execution.user.slug,
    triggerType: execution.triggerType,
    mode: execution.executionMode,
    executionMode: execution.executionMode,
    status: 'queued',
    payload,
    credentialReferences,
    settings: { credentials: workerSettings },
    statusCallbackUrl: `${callbackBaseUrl}/api/internal/integration-executions/${encodeURIComponent(execution.id)}/status`,
    createdAt: execution.createdAt,
  };
}

async function publishToSqs(executionId) {
  const execution = await executionService.getExecutionForQueue(executionId);
  if (!execution) throw new Error(`Execution not found: ${executionId}`);
  if (!execution.integration) throw new Error(`Execution ${executionId} has no integration.`);

  const { queueUrl } = resolveSqsQueueUrl(execution.integration);
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  const client = new SQSClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1' });
  const message = buildSqsJobMessage(execution);
  const result = await client.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      integrationSlug: { DataType: 'String', StringValue: execution.integration.slug },
      executionMode: { DataType: 'String', StringValue: execution.executionMode },
      triggerType: { DataType: 'String', StringValue: execution.triggerType },
    },
  }));

  return executionService.markQueued(executionId, { messageId: result.MessageId, queueUrl });
}

function runLocalWorker(executionId, { timeoutMs = LOCAL_WORKER_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), 'src', 'workers', 'local-execution-worker.js');
    const child = spawn(process.execPath, [workerPath, executionId], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Execution worker timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Execution worker exited with code ${code}.`));
    });
  });
}

async function waitForExecution(executionId, { timeoutMs = LOCAL_WORKER_TIMEOUT_MS + 5000, intervalMs = 250 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const execution = await executionService.getExecutionById(executionId);
    if (execution && ['success', 'failed', 'dead_letter'].includes(execution.status)) return execution;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for execution ${executionId}.`);
}

async function enqueueExecution(executionId, { wait = false } = {}) {
  if (QUEUE_MODE === 'local') {
    const running = runLocalWorker(executionId).catch(async (err) => {
      await executionService.markFailed(executionId, err.message).catch(() => {});
      throw err;
    });

    if (wait) {
      await running;
      return waitForExecution(executionId);
    }

    running.catch(() => {});
    return executionService.getExecutionById(executionId);
  }

  if (QUEUE_MODE === 'sqs') {
    const queued = await publishToSqs(executionId);
    return queued;
  }

  throw new Error(`Unknown QUEUE_MODE: ${QUEUE_MODE}`);
}

module.exports = {
  enqueueExecution,
  waitForExecution,
  resolveSqsQueueUrl,
  buildSqsJobMessage,
};
