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
const { redactExecutionForDisplay } = require('../core/execution-privacy');
const { createLogger } = require('../core/logger');

router.use(requireAuth);

router.post('/:id/test', loadIntegration({ mutate: true }), async (req, res) => {
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
    res.json({ execution: redactExecutionForDisplay(req.integration, execution) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:id/dry-run', loadIntegration({ mutate: true }), async (req, res) => {
  const { payload = {} } = req.body || {};
  const execution = await runManual({
    integration: req.integration,
    user: req.user,
    executionMode: 'dry_run',
    payload,
    isTest: true,
  });
  res.json({ execution: redactExecutionForDisplay(req.integration, execution) });
});

router.post('/:id/test-connector', loadIntegration({ mutate: true }), async (req, res) => {
  const { connector, credentials } = req.body || {};
  if (!connector) return res.status(400).json({ error: '"connector" is required.' });
  const testedAt = new Date().toISOString();
  const logger = createLogger({
    userId: req.integration.userId,
    integrationId: req.integration.id,
    executionMode: 'test',
    isTest: true,
  });
  try {
    const result = await testConnector(req.integration, connector, credentials);
    const persistedResult = {
      success: result.success === true,
      configurationOnly: result.configurationOnly === true,
      message: result.message,
      nextStep: result.nextStep,
      nextSteps: result.nextSteps,
      provider: result.provider,
      statusCode: result.statusCode,
      errorCode: result.errorCode,
      testedAt,
    };
    await (persistedResult.success ? logger.info : logger.warning)('Connector settings check completed.', {
      connector,
      ...persistedResult,
      status: persistedResult.success ? 'success' : 'failed',
    });
    res.json({ result: { ...result, testedAt } });
  } catch (err) {
    await logger.warning('Connector settings check completed.', {
      connector,
      success: false,
      configurationOnly: false,
      message: err.message,
      status: 'failed',
      testedAt,
    });
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/test-connector-status', loadIntegration(), async (req, res) => {
  const connector = String(req.query.connector || '').trim();
  if (!connector) return res.status(400).json({ error: '"connector" query parameter is required.' });

  const rows = await prisma.log.findMany({
    where: {
      integrationId: req.integration.id,
      executionId: null,
      message: 'Connector settings check completed.',
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  for (const row of rows) {
    try {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      if (metadata.connector === connector) {
        return res.json({
          result: {
            success: metadata.success === true,
            configurationOnly: metadata.configurationOnly === true,
            message: metadata.message,
            nextStep: metadata.nextStep,
            nextSteps: metadata.nextSteps,
            provider: metadata.provider,
            statusCode: metadata.statusCode,
            errorCode: metadata.errorCode,
            testedAt: metadata.testedAt || row.createdAt,
          },
        });
      }
    } catch {
      // Ignore malformed historical metadata and continue to an older valid check.
    }
  }

  res.json({ result: null });
});

module.exports = router;
