/**
 * "Test Credentials" tool (CLAUDE.md 9.8): validates a connector's
 * credentials by calling its real testConnection(), without running the
 * full handler or creating an Execution record (this is a lighter-weight
 * check than a full test run).
 */
const { getRealConnector } = require('../connectors');
const credentialsService = require('./credentials');

async function testConnector(integration, connectorName, overrideCredentials) {
  const credentials = overrideCredentials || (await credentialsService.loadCredentialsForExecution(integration));
  const connector = getRealConnector(connectorName);
  if (typeof connector.testConnection !== 'function') {
    throw new Error(`Connector "${connectorName}" does not implement testConnection().`);
  }
  return connector.testConnection(credentials);
}

module.exports = { testConnector };
