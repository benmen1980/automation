const prisma = require('../db/client');
const integrationLoader = require('./integration-loader');
const secretsStore = require('./secrets');
const { createAndEnqueue } = require('./manual-runner');

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
  wait = executionMode !== 'live',
}) {
  const found = await findWebhookIntegration(userSlug, integrationSlug);
  if (!found) throw httpError('Webhook not found.', 404);
  const { integration } = found;

  if (integration.status !== 'active') throw httpError('Integration is not active.', 403);

  if (!skipTokenCheck) {
    const definition = integrationLoader.loadDefinition(integration, { bypassCache: true });
    const requiresToken = definition && definition.webhook && definition.webhook.requiresToken === true;
    if (requiresToken) {
      const expected = await secretsStore.getSecret(integration.id, WEBHOOK_TOKEN_KEY);
      if (!expected || providedToken !== expected) throw httpError('Invalid or missing webhook token.', 401);
    }
  }

  return createAndEnqueue({ integration, triggerType, executionMode, payload, wait });
}

async function setWebhookToken(integration, token) {
  return secretsStore.setSecret(integration.id, WEBHOOK_TOKEN_KEY, token);
}

async function getWebhookToken(integration) {
  return secretsStore.getSecret(integration.id, WEBHOOK_TOKEN_KEY);
}

module.exports = { runWebhook, findWebhookIntegration, setWebhookToken, getWebhookToken, WEBHOOK_TOKEN_KEY };
