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
  loadDefinition,
  loadHandler,
  clearCache,
};
