const whatsappReal = require('./whatsapp/real');
const whatsappMock = require('./whatsapp/mock');
const genericRestReal = require('./generic-rest/real');
const genericRestMock = require('./generic-rest/mock');
const emailReal = require('./email/real');
const emailMock = require('./email/mock');
const priorityReal = require('./priority/real');
const priorityMock = require('./priority/mock');
const shopifyReal = require('./shopify/real');
const shopifyMock = require('./shopify/mock');
const gmailReal = require('./gmail/real');
const gmailMock = require('./gmail/mock');

const REGISTRY = {
  whatsapp: { real: whatsappReal, mock: whatsappMock },
  genericRest: { real: genericRestReal, mock: genericRestMock },
  email: { real: emailReal, mock: emailMock },
  priority: { real: priorityReal, mock: priorityMock },
  shopify: { real: shopifyReal, mock: shopifyMock },
  gmail: { real: gmailReal, mock: gmailMock },
};

const MOCK_MODES = new Set(['dummy', 'mock_output']);

function wrapDryRun(name, impl, logger) {
  const wrapped = {};
  for (const methodName of Object.keys(impl)) {
    if (methodName === 'testConnection') {
      wrapped[methodName] = impl[methodName];
      continue;
    }
    wrapped[methodName] = async (...args) => {
      await logger?.info('External API call skipped because execution mode is dry_run.', {
        connector: name,
        method: methodName,
      });
      return { success: true, skipped: true, reason: 'dry_run', mocked: false };
    };
  }
  return wrapped;
}

function bindCredentials(impl, credentials) {
  const bound = {};
  for (const methodName of Object.keys(impl)) {
    bound[methodName] = (...args) => impl[methodName](...args, credentials);
  }
  return bound;
}

function getConnectors({ executionMode, credentials = {}, logger }) {
  const connectors = {};

  for (const [name, { real, mock }] of Object.entries(REGISTRY)) {
    if (executionMode === 'dry_run') connectors[name] = wrapDryRun(name, real, logger);
    else if (MOCK_MODES.has(executionMode)) connectors[name] = mock;
    else connectors[name] = bindCredentials(real, credentials);
  }

  return connectors;
}

function getRealConnector(name) {
  const entry = REGISTRY[name];
  if (!entry) throw new Error(`Unknown connector: ${name}`);
  return entry.real;
}

module.exports = { getConnectors, getRealConnector, REGISTRY };
