const path = require('path');
const { spawn } = require('child_process');
const executionService = require('./execution-service');

const QUEUE_MODE = process.env.QUEUE_MODE || 'local';
const LOCAL_WORKER_TIMEOUT_MS = Number(process.env.LOCAL_WORKER_TIMEOUT_MS || 120000);

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
    if (execution && ['success', 'failed'].includes(execution.status)) return execution;
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
    throw new Error('QUEUE_MODE=sqs is not implemented yet. This local queue boundary is ready for SQS publishing.');
  }

  throw new Error(`Unknown QUEUE_MODE: ${QUEUE_MODE}`);
}

module.exports = { enqueueExecution, waitForExecution };
