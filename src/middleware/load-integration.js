/**
 * Shared "load this integration and verify the caller owns it (or is
 * admin)" middleware, used by integration/execution/log/test routes so
 * the ownership check (docs/product/product-architecture-spec.md 10.1) is implemented exactly once.
 */
const prisma = require('../db/client');
const { assertOwnsOrAdmin, assertCanMutate } = require('../core/permissions');
const { isAdmin } = require('../core/permissions');
const integrationLoader = require('../core/integration-loader');

async function findIntegrationByCodeKey(req, options) {
  const integrations = await prisma.integration.findMany({
    where: isAdmin(req.user) ? {} : { userId: req.user.id },
    include: options.include,
  });
  return integrations.find((candidate) => {
    try {
      return integrationLoader.loadDefinition(candidate)?.integrationKey === req.params.id;
    } catch {
      return false;
    }
  });
}

function loadIntegration(options = {}) {
  return async function (req, res, next) {
    let integration = await prisma.integration.findUnique({
      where: { id: req.params.id },
      include: options.include,
    });
    if (!integration) integration = await findIntegrationByCodeKey(req, options);
    if (!integration) return res.status(404).json({ error: 'Integration not found.' });
    try {
      assertOwnsOrAdmin(req.user, integration, 'integration');
      if (options.mutate) assertCanMutate(req.user, integration, 'integration');
    } catch (err) {
      return res.status(err.statusCode || 403).json({ error: err.message });
    }
    req.integration = integration;
    next();
  };
}

module.exports = { loadIntegration };
