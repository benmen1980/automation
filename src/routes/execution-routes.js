const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { assertOwnsOrAdmin } = require('../core/permissions');
const executionService = require('../core/execution-service');
const { runManual, replayExecution } = require('../core/manual-runner');

router.use(requireAuth);

async function loadExecutionOr404(req, res, next) {
  const execution = await executionService.getExecutionById(req.params.executionId);
  if (!execution) return res.status(404).json({ error: 'Execution not found.' });
  try {
    assertOwnsOrAdmin(req.user, execution, 'execution');
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message });
  }
  req.execution = execution;
  next();
}

router.get('/integrations/:id/executions', loadIntegration(), async (req, res) => {
  const executions = await executionService.listExecutionsForIntegration(req.integration.id);
  res.json({ executions });
});

router.get('/executions/:executionId', loadExecutionOr404, (req, res) => {
  res.json({ execution: req.execution });
});

router.post('/integrations/:id/run', loadIntegration(), async (req, res) => {
  if (!req.integration.manualRunEnabled) {
    return res.status(403).json({ error: 'Manual run is disabled for this integration.' });
  }
  const { executionMode = 'test', payload = {} } = req.body || {};
  const execution = await runManual({
    integration: req.integration,
    user: req.user,
    executionMode,
    payload,
    isTest: executionMode !== 'live',
  });
  res.json({ execution });
});

router.post('/executions/:executionId/replay', loadExecutionOr404, async (req, res) => {
  const integration = await prisma.integration.findUnique({ where: { id: req.execution.integrationId } });
  if (!integration) return res.status(404).json({ error: 'Integration for this execution no longer exists.' });

  const { executionMode = 'test' } = req.body || {};
  const execution = await replayExecution({ sourceExecution: req.execution, integration, user: req.user, executionMode });
  res.json({ execution });
});

module.exports = router;
