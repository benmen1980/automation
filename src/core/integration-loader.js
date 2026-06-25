/**
 * Securely loads an integration's integration.js and handler.js.
 *
 * Per docs/product/product-architecture-spec.md 10.3, integration code must NEVER be loaded directly from
 * URL/route parameters. The only inputs to this module are values already
 * read from the database (integration.codeFolder), and every path is
 * re-validated to live under INTEGRATIONS_ROOT before any `require()` call.
 *
 * Correct flow (already enforced by callers in routes/webhook-runner.js
 * etc., repeated here as the last line of defense):
 *   1. Receive user/integration slug from the request.
 *   2. Look up the matching Integration row in the DB (ownership + active
 *      checks happen there).
 *   3. Pass integration.codeFolder (a DB value, not a raw param) in here.
 */
const fs = require('fs');
const path = require('path');

const INTEGRATIONS_ROOT = path.resolve(process.cwd(), process.env.INTEGRATIONS_ROOT || 'src/integrations');

const definitionCache = new Map();
const handlerCache = new Map();

/**
 * Resolves `relativeFolder` against INTEGRATIONS_ROOT and throws if the
 * result escapes that root (path traversal via "..", absolute paths, or
 * symlink tricks resolved through path.resolve's normalization).
 */
function resolveSafeFolder(relativeFolder) {
  if (typeof relativeFolder !== 'string' || relativeFolder.trim() === '') {
    throw new Error('Integration codeFolder is missing or invalid.');
  }
  const resolved = path.resolve(process.cwd(), relativeFolder);
  const withSep = resolved.endsWith(path.sep) ? resolved : resolved + path.sep;
  const rootWithSep = INTEGRATIONS_ROOT.endsWith(path.sep) ? INTEGRATIONS_ROOT : INTEGRATIONS_ROOT + path.sep;
  if (!withSep.startsWith(rootWithSep)) {
    throw new Error(
      `Refusing to load integration code outside of ${INTEGRATIONS_ROOT}: resolved path was ${resolved}`
    );
  }
  return resolved;
}

function resolveSafeFile(folder, fileName) {
  const safeFolder = resolveSafeFolder(folder);
  const resolved = path.resolve(safeFolder, fileName);
  const withSep = resolved.startsWith(safeFolder + path.sep) || resolved === safeFolder;
  if (!withSep) {
    throw new Error(`Refusing to load file outside of its integration folder: ${resolved}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Integration file not found: ${resolved}`);
  }
  return resolved;
}

/**
 * Validates that integration.js and handler.js both exist for a given
 * codeFolder. Used when an admin registers/updates an integration
 * (docs/product/product-architecture-spec.md 8.3 step 5).
 */
function validateIntegrationFiles(codeFolder, definitionFile = 'integration.js', handlerFile = 'handler.js') {
  const definitionPath = resolveSafeFile(codeFolder, definitionFile);
  const handlerPath = resolveSafeFile(codeFolder, handlerFile);
  return { definitionPath, handlerPath };
}

function validateIntegrationContract(definition, { strict = true } = {}) {
  const errors = [];
  const requiredTextFields = ['name', 'description', 'type'];
  for (const field of requiredTextFields) {
    if (typeof definition?.[field] !== 'string' || definition[field].trim() === '') {
      errors.push(`integration.js must define a non-empty ${field}.`);
    }
  }

  if (!['webhook', 'scheduled'].includes(definition?.type)) {
    errors.push('integration.js type must be "webhook" or "scheduled".');
  }

  if (!Array.isArray(definition?.connectors)) {
    errors.push('integration.js must define connectors as an array, even when empty.');
  }
  if (!Array.isArray(definition?.credentialTests)) {
    errors.push('integration.js must define credentialTests as an array, even when empty.');
  }

  const logging = definition?.logging;
  if (!logging || typeof logging !== 'object') {
    errors.push('integration.js must define logging metadata.');
  } else {
    if (!['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'].includes(logging.direction)) {
      errors.push('logging.direction must be INBOUND, OUTBOUND, or BIDIRECTIONAL.');
    }
    if (logging.reviewRequired !== true) {
      errors.push('logging.reviewRequired must be true so every integration receives a log-review step.');
    }
    if (typeof logging.cloudWatchLogGroup !== 'string' || logging.cloudWatchLogGroup.trim() === '') {
      errors.push('logging.cloudWatchLogGroup must identify the per-integration CloudWatch/log group.');
    }
    if (!Array.isArray(logging.steps) || logging.steps.length === 0) {
      errors.push('logging.steps must list the important user-readable log steps.');
    } else {
      const hasDirectionStep = logging.steps.some(
        (step) => typeof step === 'string' && /\b(Received from|Sent to)\b/i.test(step)
      );
      if (!hasDirectionStep) {
        errors.push('logging.steps must include at least one directional step such as "Received from WhatsApp" or "Sent to Priority".');
      }
      for (const step of logging.steps) {
        if (typeof step !== 'string' || step.trim() === '') {
          errors.push('Every logging.steps item must be a non-empty plain-language string.');
        }
      }
    }
  }

  if (definition?.type === 'webhook') {
    if (!definition.webhook || typeof definition.webhook !== 'object') {
      errors.push('Webhook integrations must define webhook settings.');
    } else {
      if (!definition.webhook.method) errors.push('Webhook integrations must define webhook.method.');
      if (typeof definition.webhook.requiresToken !== 'boolean') {
        errors.push('Webhook integrations must define webhook.requiresToken as true or false.');
      }
    }
  }

  const testing = definition?.testing;
  if (!testing || typeof testing !== 'object') {
    errors.push('integration.js must define testing metadata.');
  } else {
    const modes = Array.isArray(testing.modes) ? testing.modes : [];
    if (modes.length === 0) errors.push('testing.modes must list the allowed test/run modes.');
    if (!testing.defaultMode) errors.push('testing.defaultMode must be set to the safest default mode.');
    if (testing.defaultMode && modes.length > 0 && !modes.includes(testing.defaultMode)) {
      errors.push('testing.defaultMode must be included in testing.modes.');
    }
    for (const mode of modes) {
      if (!testing.modeDescriptions?.[mode]) {
        errors.push(`testing.modeDescriptions.${mode} must explain that mode in plain language.`);
      }
    }
  }

  const credentials = Array.isArray(definition?.credentials) ? definition.credentials : [];
  if (!Array.isArray(definition?.credentials)) errors.push('integration.js must define credentials as an array.');
  for (const field of credentials) {
    if (!field.key) errors.push('Every credential field must define key.');
    if (!field.label) errors.push(`Credential ${field.key || '<unknown>'} must define a clear label.`);
    if (!field.type) errors.push(`Credential ${field.key || '<unknown>'} must define type.`);
    if (!field.helper && !field.helperUrl) {
      errors.push(`Credential ${field.key || '<unknown>'} must include helper text or a helperUrl.`);
    }
  }

  if (strict && !Array.isArray(definition?.testPayloads) && definition?.sampleData === undefined) {
    errors.push('integration.js must include testPayloads or sampleData for safe local testing.');
  }

  if (errors.length > 0) {
    const err = new Error(`Integration contract validation failed:\n- ${errors.join('\n- ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return true;
}

function loadDefinitionFromPath(definitionPath, { bypassCache = true } = {}) {
  if (bypassCache) delete require.cache[require.resolve(definitionPath)];
  return require(definitionPath);
}

function loadDefinition(integration, { bypassCache = false } = {}) {
  const definitionPath = resolveSafeFile(integration.codeFolder, integration.definitionFile || 'integration.js');
  if (bypassCache) delete require.cache[require.resolve(definitionPath)];
  if (!bypassCache && definitionCache.has(integration.id)) {
    return definitionCache.get(integration.id);
  }
  const definition = require(definitionPath);
  definitionCache.set(integration.id, definition);
  return definition;
}

function loadHandler(integration, { bypassCache = false } = {}) {
  const handlerPath = resolveSafeFile(integration.codeFolder, integration.handlerFile || 'handler.js');
  if (bypassCache) delete require.cache[require.resolve(handlerPath)];
  if (!bypassCache && handlerCache.has(integration.id)) {
    return handlerCache.get(integration.id);
  }
  const handlerModule = require(handlerPath);
  if (!handlerModule || typeof handlerModule.execute !== 'function') {
    throw new Error(
      `handler.js for integration ${integration.id} must export { execute(ctx) }. Got: ${typeof handlerModule}`
    );
  }
  handlerCache.set(integration.id, handlerModule);
  return handlerModule;
}

function clearCache(integrationId) {
  definitionCache.delete(integrationId);
  handlerCache.delete(integrationId);
}

module.exports = {
  INTEGRATIONS_ROOT,
  resolveSafeFolder,
  resolveSafeFile,
  validateIntegrationFiles,
  validateIntegrationContract,
  loadDefinitionFromPath,
  loadDefinition,
  loadHandler,
  clearCache,
};
