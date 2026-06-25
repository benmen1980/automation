/**
 * Dashboard testing tools (docs/product/product-architecture-spec.md 9.2, 9.3, 9.8). The webhook test
 * path reuses core/webhook-runner.runWebhook — the exact same function
 * the public /webhooks/:userSlug/:integrationSlug route calls — so a test
 * run behaves identically to production except for auth and (by default)
 * token validation.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { runWebhook } = require('../core/webhook-runner');
const { runManual } = require('../core/manual-runner');
const { testConnector } = require('../core/testing-runner');

router.use(requireAuth);

router.post('/:id/test', loadIntegration(), async (req, res) => {
  const { payload = {}, executionMode = 'test', headers = {}, testTokenValidation = false } = req.body || {};

  try {
    let execution;
    if (req.integration.type === 'webhook') {
      const owner = await prisma.user.findUnique({ where: { id: req.integration.userId } });
      const authHeader = headers.Authorization || headers.authorization || '';
      const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

      execution = await runWebhook({
        userSlug: owner.slug,
        integrationSlug: req.integration.slug,
        payload,
        providedToken,
        executionMode,
        triggerType: 'manual',
        // Normally skip the token check so testers don't need a real
        // token just to test payload/mapping logic. Set
        // testTokenValidation:true to specifically exercise the 401 path.
        skipTokenCheck: !testTokenValidation,
        isTest: true,
      });
    } else {
      execution = await runManual({ integration: req.integration, user: req.user, executionMode, payload, isTest: true });
    }
    res.json({ execution });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:id/dry-run', loadIntegration(), async (req, res) => {
  const { payload = {} } = req.body || {};
  const execution = await runManual({
    integration: req.integration,
    user: req.user,
    executionMode: 'dry_run',
    payload,
    isTest: true,
  });
  res.json({ execution });
});

router.post('/:id/test-connector', loadIntegration(), async (req, res) => {
  const { connector, credentials } = req.body || {};
  if (!connector) return res.status(400).json({ error: '"connector" is required.' });
  try {
    const result = await testConnector(req.integration, connector, credentials);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
