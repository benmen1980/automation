const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { canAccessIntegration } = require('../core/permissions');

router.use(requireAuth);

// Per docs/product/product-architecture-spec.md 5.10: logs are searchable/filterable by level, integration,
// execution, mode, and date.
router.get('/integrations/:id/logs', loadIntegration(), async (req, res) => {
  const { level, mode, eventType, correlationId, executionId, from, to, take } = req.query;
  const where = { integrationId: req.integration.id };
  if (level) where.level = level;
  if (mode) where.executionMode = mode;
  if (executionId) where.executionId = executionId;
  if (eventType) where.eventType = eventType;
  if (correlationId) where.correlationId = correlationId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const logs = await prisma.log.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take ? Math.min(Number(take), 1000) : 200,
  });
  res.json({ logs });
});

router.get('/executions/:executionId/logs', async (req, res) => {
  const execution = await prisma.execution.findUnique({ where: { id: req.params.executionId } });
  if (!execution) return res.status(404).json({ error: 'Execution not found.' });
  const integration = await prisma.integration.findUnique({ where: { id: execution.integrationId } });
  try {
    if (!canAccessIntegration(req.user, integration)) {
      const err = new Error('You do not have access to this execution.');
      err.statusCode = 403;
      throw err;
    }
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message });
  }

  const logs = await prisma.log.findMany({ where: { executionId: execution.id }, orderBy: { createdAt: 'asc' } });
  res.json({ logs });
});

module.exports = router;
