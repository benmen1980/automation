/**
 * Builds the `connectors` object injected into every handler.execute().
 *
 * Mode selection rule (CLAUDE.md 9.5 / 9.4):
 *   - executionMode === 'dry_run'    -> every connector call is intercepted,
 *                                       logged as skipped, and returns a
 *                                       generic "skipped" result. No real
 *                                       or mock network code runs at all.
 *   - executionMode === 'mock_output'-> mock/*.js implementations.
 *   - everything else (live, test,
 *     mock_input, replay)            -> real/*.js implementations.
 */
const whatsappReal = require('./whatsapp/real');
const whatsappMock = require('./whatsapp/mock');
const genericRestReal = require('./generic-rest/real');
const genericRestMock = require('./generic-rest/mock');
const emailReal = require('./email/real');
const emailMock = require('./email/mock');

const REGISTRY = {
  whatsapp: { real: whatsappReal, mock: whatsappMock },
  genericRest: { real: genericRestReal, mock: genericRestMock },
  email: { real: emailReal, mock: emailMock },
};

function wrapDryRun(name, impl, logger) {
  const wrapped = {};
  for (const methodName of Object.keys(impl)) {
    if (methodName === 'testConnection') {
      wrapped[methodName] = impl[methodName]; // testing credentials is safe even in dry_run
      continue;
    }
    wrapped[methodName] = async (...args) => {
      await logger?.info(`External API call skipped because execution mode is dry_run.`, {
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

/**
 * @param {object} opts
 * @param {'live'|'test'|'dry_run'|'mock_input'|'mock_output'|'replay'} opts.executionMode
 * @param {object} opts.credentials - flat key/value map of this integration's credentials
 * @param {object} opts.logger - logger from core/logger.js, used for dry_run skip messages
 */
function getConnectors({ executionMode, credentials = {}, logger }) {
  const connectors = {};

  for (const [name, { real, mock }] of Object.entries(REGISTRY)) {
    if (executionMode === 'dry_run') {
      connectors[name] = wrapDryRun(name, real, logger);
    } else if (executionMode === 'mock_output') {
      connectors[name] = mock; // mocks don't need credentials
    } else {
      connectors[name] = bindCredentials(real, credentials);
    }
  }

  return connectors;
}

/**
 * Looks up a single connector's real implementation by name, for the
 * "Test Credentials" button (CLAUDE.md 9.8) — always uses the real
 * implementation since the whole point is to validate real credentials.
 */
function getRealConnector(name) {
  const entry = REGISTRY[name];
  if (!entry) throw new Error(`Unknown connector: ${name}`);
  return entry.real;
}

module.exports = { getConnectors, getRealConnector, REGISTRY };
