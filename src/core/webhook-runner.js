/**
 * Public webhook entry point AND the dashboard's "test webhook" tool both
 * call runWebhook() — per CLAUDE.md 9.2 they must share one runner so a
 * test run behaves exactly like production. The only difference is that
 * the dashboard test path is already authenticated (so it skips the
 * public token check) and lets the caller pick executionMode/payload.
 */
const prisma = require('../db/client');
const integrationLoader = require('./integration-loader');
const secretsStore = require('./secrets');
const { runExecution } = require('./execution-runner');

const WEBHOOK_TOKEN_KEY = 'WEBHOOK_TOKEN';

async function findWebhookIntegration(userSlug, integrationSlug) {
  const user = await prisma.user.findUnique({ where: { slug: userSlug } });
  if (!user) return null;
  const integration = await prisma.integration.findUnique({
    where: { userId_slug: { userId: user.id, slug: integrationSlug } },
    include: { webhookSettings: true },
  });
  if (!integration || integration.type !== 'webhook') return null;
  return { user, integration };
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function runWebhook({
  userSlug,
  integrationSlug,
  payload,
  providedToken,
  executionMode = 'live',
  triggerType = 'webhook',
  skipTokenCheck = false,
  isTest = false,
}) {
  const found = await findWebhookIntegration(userSlug, integrationSlug);
  if (!found) throw httpError('Webhook not found.', 404);
  const { user, integration } = found;

  if (integration.status !== 'active') {
    throw httpError('Integration is not active.', 403);
  }

  if (!skipTokenCheck) {
    const definition = integrationLoader.loadDefinition(integration);
    const requiresToken = definition && definition.webhook && definition.webhook.requiresToken === true;
    if (requiresToken) {
      const expected = await secretsStore.getSecret(integration.id, WEBHOOK_TOKEN_KEY);
      if (!expected || providedToken !== expected) {
        throw httpError('Invalid or missing webhook token.', 401);
      }
    }
  }

  return runExecution({
    integration,
    user: { id: user.id, slug: user.slug, email: user.email, role: user.role },
    triggerType,
    executionMode,
    payload,
    isTest,
  });
}

/**
 * Sets (or rotates) the bearer token required on the public webhook URL
 * and returns the secrets-store reference name (not the token itself).
 * Callers (see routes/integration-routes.js) are responsible for writing
 * that reference onto the integration's WebhookSettings row — this
 * function only touches the secrets store, so it has no opinion about
 * webhookUrl or other WebhookSettings fields.
 */
async function setWebhookToken(integration, token) {
  return secretsStore.setSecret(integration.id, WEBHOOK_TOKEN_KEY, token);
}

module.exports = { runWebhook, findWebhookIntegration, setWebhookToken, WEBHOOK_TOKEN_KEY };
