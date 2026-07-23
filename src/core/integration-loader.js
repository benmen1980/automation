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
const INTEGRATIONS_ROOT_REAL = fs.realpathSync.native(INTEGRATIONS_ROOT);

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
  if (!fs.existsSync(resolved)) {
    throw new Error(`Integration codeFolder does not exist: ${resolved}`);
  }
  const realResolved = fs.realpathSync.native(resolved);
  const withSep = realResolved.endsWith(path.sep) ? realResolved : realResolved + path.sep;
  const rootWithSep = INTEGRATIONS_ROOT_REAL.endsWith(path.sep) ? INTEGRATIONS_ROOT_REAL : INTEGRATIONS_ROOT_REAL + path.sep;
  if (!withSep.startsWith(rootWithSep)) {
    throw new Error(
      `Refusing to load integration code outside of ${INTEGRATIONS_ROOT_REAL}: resolved path was ${realResolved}`
    );
  }
  return resolved;
}

function validateLoggingContract(logging, errors, prefix = 'logging') {
  if (!logging || typeof logging !== 'object') {
    errors.push(`${prefix} metadata is required.`);
    return;
  }
  if (!['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'].includes(logging.direction)) {
    errors.push(`${prefix}.direction must be INBOUND, OUTBOUND, or BIDIRECTIONAL.`);
  }
  if (logging.reviewRequired !== true) {
    errors.push(`${prefix}.reviewRequired must be true so every integration receives a log-review step.`);
  }
  if (typeof logging.cloudWatchLogGroup !== 'string' || logging.cloudWatchLogGroup.trim() === '') {
    errors.push(`${prefix}.cloudWatchLogGroup must identify the per-integration CloudWatch/log group.`);
  }
  if (!Array.isArray(logging.steps) || logging.steps.length === 0) {
    errors.push(`${prefix}.steps must list the important user-readable log steps.`);
  } else {
    const hasDirectionStep = logging.steps.some(
      (step) => typeof step === 'string' && /\b(Received from|Sent to)\b/i.test(step)
    );
    if (!hasDirectionStep) {
      errors.push(`${prefix}.steps must include at least one directional step such as "Received from WhatsApp" or "Sent to Priority".`);
    }
    for (const step of logging.steps) {
      if (typeof step !== 'string' || step.trim() === '') {
        errors.push(`Every ${prefix}.steps item must be a non-empty plain-language string.`);
      }
    }
  }
}

function validateTestingContract(testing, errors, prefix = 'testing') {
  if (!testing || typeof testing !== 'object') {
    errors.push(`${prefix} metadata is required.`);
    return;
  }
  const modes = Array.isArray(testing.modes) ? testing.modes : [];
  if (modes.length === 0) errors.push(`${prefix}.modes must list the allowed test/run modes.`);
  if (!testing.defaultMode) errors.push(`${prefix}.defaultMode must be set to the safest default mode.`);
  if (testing.defaultMode && modes.length > 0 && !modes.includes(testing.defaultMode)) {
    errors.push(`${prefix}.defaultMode must be included in ${prefix}.modes.`);
  }
  for (const mode of modes) {
    if (!testing.modeDescriptions?.[mode]) {
      errors.push(`${prefix}.modeDescriptions.${mode} must explain that mode in plain language.`);
    }
  }
}

function validateCredentialFields(credentials, errors, prefix = 'credentials') {
  if (!Array.isArray(credentials)) {
    errors.push(`${prefix} must be an array.`);
    return [];
  }
  for (const field of credentials) {
    if (!field.key) errors.push(`Every ${prefix} field must define key.`);
    if (!field.label && prefix === 'credentials') errors.push(`Credential ${field.key || '<unknown>'} must define a clear label.`);
    if (!field.type) errors.push(`Credential ${field.key || '<unknown>'} must define type.`);
    if (!field.helper && !field.helperUrl) {
      errors.push(`Credential ${field.key || '<unknown>'} must include helper text or a helperUrl.`);
    }
  }
  return credentials;
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
  const requiredTextFields = ['name', 'integrationKey', 'description', 'type'];
  for (const field of requiredTextFields) {
    if (typeof definition?.[field] !== 'string' || definition[field].trim() === '') {
      errors.push(`integration.js must define a non-empty ${field}.`);
    }
  }
  if (definition?.integrationKey && !/^int_[a-z0-9]{16}$/.test(definition.integrationKey)) {
    errors.push('integration.js integrationKey must use the format int_<16 lowercase letters or digits>.');
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

  validateLoggingContract(definition?.logging, errors, 'logging');

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

  validateTestingContract(definition?.testing, errors, 'testing');

  validateCredentialFields(definition?.credentials, errors, 'credentials');

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

function validateWorkerManifestContract(manifest, { strict = true } = {}) {
  const errors = [];
  for (const field of ['name', 'type', 'runtime', 'direction']) {
    if (typeof manifest?.[field] !== 'string' || manifest[field].trim() === '') {
      errors.push(`manifest.js must define a non-empty ${field}.`);
    }
  }
  if (manifest?.type !== 'worker') errors.push('manifest.js type must be "worker".');
  if (!['lambda', 'fargate', 'local'].includes(manifest?.runtime)) {
    errors.push('manifest.js runtime must be lambda, fargate, or local.');
  }
  if (!['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'].includes(manifest?.direction)) {
    errors.push('manifest.js direction must be INBOUND, OUTBOUND, or BIDIRECTIONAL.');
  }
  if (!Array.isArray(manifest?.triggers) || manifest.triggers.length === 0) {
    errors.push('manifest.js triggers must list manual, schedule, webhook, file, or queue triggers.');
  }
  validateCredentialFields(manifest?.credentials, errors, 'credentials');
  validateLoggingContract(manifest?.logging, errors, 'logging');
  validateTestingContract(manifest?.testing, errors, 'testing');
  const deployment = manifest?.deployment;
  if (!deployment || typeof deployment !== 'object') {
    errors.push('manifest.js must define deployment metadata.');
  } else {
    for (const field of ['pipelineName', 'queueName', 'dlqName', 'cloudWatchLogGroup']) {
      if (typeof deployment[field] !== 'string' || deployment[field].trim() === '') {
        errors.push(`deployment.${field} must be set.`);
      }
    }
  }
  if (strict && !manifest?.sampleJob && !manifest?.fixtures) {
    errors.push('manifest.js must reference sampleJob or fixtures for safe local testing.');
  }

  if (errors.length > 0) {
    const err = new Error(`Worker manifest validation failed:\n- ${errors.join('\n- ')}`);
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
  validateWorkerManifestContract,
  loadDefinitionFromPath,
  loadDefinition,
  loadHandler,
  clearCache,
};
