/**
 * "Test Credentials" tool (docs/product/product-architecture-spec.md 9.8): validates a connector's
 * credentials by calling its real testConnection(), without running the
 * full handler or creating an Execution record (this is a lighter-weight
 * check than a full test run).
 */
const { getRealConnector } = require('../connectors');
const credentialsService = require('./credentials');
const prisma = require('../db/client');

async function testConnector(integration, connectorName, overrideCredentials) {
  const credentials = overrideCredentials || (await credentialsService.loadCredentialsForExecution(integration));
  if (!credentials.__USER_SLUG) {
    const user = await prisma.user.findUnique({ where: { id: integration.userId } });
    if (user) credentials.__USER_SLUG = user.slug;
  }
  const connector = getRealConnector(connectorName);
  if (typeof connector.testConnection !== 'function') {
    throw new Error(`Connector "${connectorName}" does not implement testConnection().`);
  }
  return connector.testConnection(credentials);
}

module.exports = { testConnector };
