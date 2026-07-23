/**
 * Public, unauthenticated webhook endpoint: POST /webhooks/:integrationKey
 * (docs/product/product-architecture-spec.md 5.7). Token/signature validation happens inside
 * core/webhook-runner.js, not here — this route is a thin HTTP adapter.
 */
const express = require('express');
const router = express.Router();
const { runWebhook } = require('../core/webhook-runner');

function extractWebhookToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return { token: authHeader.slice(7).trim(), headerName: 'Authorization' };
  const headerNames = [
    'priority-bpm-token',
    'x-webhook-token',
    'x-priority-token',
    'x-priority-webhook-token',
  ];
  for (const headerName of headerNames) {
    const headerToken = req.headers[headerName];
    if (headerToken) {
      return {
        token: typeof headerToken === 'string' ? headerToken.trim() : headerToken,
        headerName,
      };
    }
  }
  return { token: undefined, headerName: 'none' };
}

function priorityHeadersSummary(req) {
  return {
    priorityBpmId: req.headers['priority-bpm-id'],
    priorityBpmSubject: req.headers['priority-bpm-subject'],
    priorityFormName: req.headers['priority-form-name'],
    contentType: req.headers['content-type'],
    forwardedFor: req.headers['x-forwarded-for'] ? '[present]' : undefined,
  };
}

router.post('/:userSlug/:integrationSlug', async (req, res) => {
  const provided = extractWebhookToken(req);

  try {
    const execution = await runWebhook({
      userSlug: req.params.userSlug,
      integrationSlug: req.params.integrationSlug,
      payload: req.body,
      providedToken: provided.token,
      providedHeaderName: provided.headerName,
      providerHeaders: priorityHeadersSummary(req),
      executionMode: 'live',
      triggerType: 'webhook',
    });
    // The webhook call itself succeeded (we accepted and ran it); a
    // failed *handler* still gets a 200 with status:"failed" in the body
    // so well-behaved senders don't endlessly retry a payload that will
    // never succeed. Senders that care should inspect execution.status.
    res.status(200).json({ execution });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:integrationKey', async (req, res) => {
  const provided = extractWebhookToken(req);

  try {
    const execution = await runWebhook({
      integrationKey: req.params.integrationKey,
      payload: req.body,
      providedToken: provided.token,
      providedHeaderName: provided.headerName,
      providerHeaders: priorityHeadersSummary(req),
      executionMode: 'live',
      triggerType: 'webhook',
    });
    res.status(200).json({ execution });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
module.exports._diagnostics = { extractWebhookToken };
