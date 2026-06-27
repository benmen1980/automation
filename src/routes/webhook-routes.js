/**
 * Public, unauthenticated webhook endpoint: POST /webhooks/:userSlug/:integrationSlug
 * (docs/product/product-architecture-spec.md 5.7). Token/signature validation happens inside
 * core/webhook-runner.js, not here — this route is a thin HTTP adapter.
 */
const express = require('express');
const router = express.Router();
const { runWebhook } = require('../core/webhook-runner');

function extractWebhookToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const headerToken = (
    req.headers['x-webhook-token'] ||
    req.headers['priority-bpm-token'] ||
    req.headers['x-priority-token'] ||
    req.headers['x-priority-webhook-token'] ||
    undefined
  );
  return typeof headerToken === 'string' ? headerToken.trim() : headerToken;
}

router.post('/:userSlug/:integrationSlug', async (req, res) => {
  const providedToken = extractWebhookToken(req);

  try {
    const execution = await runWebhook({
      userSlug: req.params.userSlug,
      integrationSlug: req.params.integrationSlug,
      payload: req.body,
      providedToken,
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

module.exports = router;
module.exports._diagnostics = { extractWebhookToken };
