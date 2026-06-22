/**
 * Public, unauthenticated webhook endpoint: POST /webhooks/:userSlug/:integrationSlug
 * (CLAUDE.md 5.7). Token/signature validation happens inside
 * core/webhook-runner.js, not here — this route is a thin HTTP adapter.
 */
const express = require('express');
const router = express.Router();
const { runWebhook } = require('../core/webhook-runner');

router.post('/:userSlug/:integrationSlug', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

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
