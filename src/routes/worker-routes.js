const crypto = require('crypto');
const express = require('express');
const executionService = require('../core/execution-service');
const telemetry = require('../core/execution-telemetry');
const { notifyExecutionFailure } = require('../core/execution-alerts');
const {
  priorityDocumentPath,
  storePriorityDocument,
} = require('../core/priority-document-store');
const { buildPublicUrl, normalizeBaseUrl } = require('../core/public-url');

const router = express.Router();

function safeTokenMatch(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
  return expectedBuffer.length > 0 && expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function requireWorkerAuth(req, res, next) {
  const expected = process.env.INTEGRATION_WORKER_CALLBACK_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Worker status callbacks are not configured.' });
  const authorization = String(req.headers.authorization || '');
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!safeTokenMatch(expected, provided)) return res.status(401).json({ error: 'Invalid worker callback authorization.' });
  next();
}

router.post('/integration-executions/:executionId/telemetry', requireWorkerAuth, async (req, res, next) => {
  try {
    const { integrationId, attempt, phase, timeoutMs, entries, errorMessage } = req.body || {};
    if (!Number.isInteger(attempt) || attempt < 1) return res.status(400).json({ error: 'Positive attempt required.' });
    const execution = await executionService.getExecutionById(req.params.executionId);
    if (!execution || execution.integrationId !== integrationId) return res.status(404).json({ error: 'Execution not found.' });
    if (phase === 'start') await telemetry.startAttempt(execution, attempt, timeoutMs);
    else if (phase === 'logs') await telemetry.appendLogs(execution, attempt, entries);
    else if (phase === 'finish') await telemetry.finishAttempt(execution, attempt, errorMessage ? new Error(errorMessage) : null);
    else return res.status(400).json({ error: 'Unsupported telemetry phase.' });
    return res.json({ accepted: true });
  } catch (err) { return next(err); }
});

router.post('/integration-executions/:executionId/status', requireWorkerAuth, async (req, res, next) => {
  try {
  const { executionId } = req.params;
  const { integrationId, status, outputPayload, errorMessage } = req.body || {};
  if (!integrationId) return res.status(400).json({ error: 'integrationId is required.' });
  if (!['running', 'retrying', 'success', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Unsupported worker execution status.' });
  }

  const existing = await executionService.getExecutionById(executionId);
  if (!existing || existing.integrationId !== integrationId) {
    return res.status(404).json({ error: 'Execution not found.' });
  }

  if (status === 'running') {
    const claim = await executionService.claimForWorker(executionId, integrationId);
    return res.json(claim);
  }
  if (status === 'success') {
    if (existing.status === 'success') return res.json({ accepted: false, alreadyCompleted: true, status: 'success' });
    const execution = await executionService.markSuccess(executionId, outputPayload);
    return res.json({ accepted: true, status: execution.status });
  }
  if (status === 'retrying') {
    const execution = await executionService.markRetrying(executionId, integrationId, errorMessage);
    if (!req.body.telemetryManaged) await notifyExecutionFailure(executionId, new Error(errorMessage || 'Worker retry requested.'), { stage: 'worker', attempt: existing.retryCount + 1 });
    return res.json({ accepted: true, status: execution.status });
  }

  const execution = await executionService.markFailed(executionId, errorMessage || 'Independent integration worker failed.');
  if (!req.body.telemetryManaged) await notifyExecutionFailure(executionId, new Error(errorMessage || 'Worker failed.'), { stage: 'worker', attempt: existing.retryCount + 1 });
  return res.json({ accepted: true, status: execution.status });
  } catch (err) {
    if (!req.body?.telemetryManaged) await notifyExecutionFailure(req.params.executionId, err, { stage: 'status-update', attempt: req.body?.attempt });
    return next(err);
  }
});

function absoluteDocumentUrl(req, publicPath) {
  const configuredUrl = buildPublicUrl(publicPath);
  if (/^https?:\/\//i.test(configuredUrl)) return configuredUrl;

  const callbackBaseUrl = normalizeBaseUrl(
    process.env.INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL
  );
  if (callbackBaseUrl) return new URL(publicPath, callbackBaseUrl).toString();

  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProtocol || req.protocol;
  return new URL(publicPath, `${protocol}://${req.get('host')}`).toString();
}

router.post(
  '/integration-executions/:executionId/document',
  requireWorkerAuth,
  express.raw({ type: 'application/octet-stream', limit: '5mb' }),
  async (req, res, next) => {
    try {
      const { executionId } = req.params;
      const integrationId = String(req.headers['x-integration-id'] || '').trim();
      if (!integrationId) {
        return res.status(400).json({ error: 'X-Integration-Id is required.' });
      }

      const existing = await executionService.getExecutionById(executionId);
      if (!existing || existing.integrationId !== integrationId) {
        return res.status(404).json({ error: 'Execution not found.' });
      }

      await storePriorityDocument(executionId, req.body);
      const publicPath = priorityDocumentPath(executionId);
      return res.json({
        saved: true,
        documentUrl: absoluteDocumentUrl(req, publicPath),
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
module.exports._diagnostics = { absoluteDocumentUrl, safeTokenMatch };
