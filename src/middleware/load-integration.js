/**
 * Shared "load this integration and verify the caller owns it (or is
 * admin)" middleware, used by integration/execution/log/test routes so
 * the ownership check (CLAUDE.md 10.1) is implemented exactly once.
 */
const prisma = require('../db/client');
const { assertOwnsOrAdmin } = require('../core/permissions');

function loadIntegration(options = {}) {
  return async function (req, res, next) {
    const integration = await prisma.integration.findUnique({
      where: { id: req.params.id },
      include: options.include,
    });
    if (!integration) return res.status(404).json({ error: 'Integration not found.' });
    try {
      assertOwnsOrAdmin(req.user, integration, 'integration');
    } catch (err) {
      return res.status(err.statusCode || 403).json({ error: err.message });
    }
    req.integration = integration;
    next();
  };
}

module.exports = { loadIntegration };
