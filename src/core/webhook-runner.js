const prisma = require('../db/client');
const integrationLoader = require('./integration-loader');
const secretsStore = require('./secrets');
const { createAndEnqueue } = require('./manual-runner');
const { createLogger } = require('./logger');
const crypto = require('crypto');

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

function fingerprint(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function tokenDiagnostics({ expected, providedToken, headerName, providerHeaders }) {
  return {
    providedHeaderName: headerName || 'none',
    providedValuePresent: !!providedToken,
    providedValueLength: providedToken ? String(providedToken).length : 0,
    providedFingerprint: fingerprint(providedToken),
    savedValueConfigured: !!expected,
    savedValueLength: expected ? String(expected).length : 0,
    savedFingerprint: fingerprint(expected),
    priorityHeaders: providerHeaders,
  };
}

async function runWebhook({
  userSlug,
  integrationSlug,
  payload,
  providedToken,
  providedHeaderName,
  providerHeaders,
  executionMode = 'live',
  triggerType = 'webhook',
  skipTokenCheck = false,
  wait = executionMode !== 'live',
}) {
  const found = await findWebhookIntegration(userSlug, integrationSlug);
  if (!found) throw httpError('Webhook not found.', 404);
  const { user, integration } = found;
  const logger = createLogger({ userId: user.id, integrationId: integration.id, executionMode, isTest: false });

  if (integration.status !== 'active') throw httpError('Integration is not active.', 403);

  if (!skipTokenCheck) {
    const definition = integrationLoader.loadDefinition(integration, { bypassCache: true });
    const requiresToken = definition && definition.webhook && definition.webhook.requiresToken === true;
    if (requiresToken) {
      const expected = await getWebhookToken(integration);
      const diagnostics = tokenDiagnostics({ expected, providedToken, headerName: providedHeaderName, providerHeaders });
      if (!expected || providedToken !== expected) {
        await logger.warning('Rejected Priority webhook before execution: the Priority BPM verification value is missing or different from the saved integration value.', {
          ...diagnostics,
          integrationName: integration.name,
          integrationSlug: integration.slug,
          triggerType,
          status: 'rejected',
          reason: 'invalid_or_missing_priority_bpm_token',
          acceptedHeader: 'Priority-BPM-Token',
          nextStep: 'Open Webhook settings, save the exact Priority BPM value from Priority, then send it using header Priority-BPM-Token.',
        });
        throw httpError('Invalid or missing webhook token.', 401);
      }
      await logger.info('Accepted Priority webhook request; creating execution.', {
        ...diagnostics,
        integrationName: integration.name,
        integrationSlug: integration.slug,
        triggerType,
        status: 'accepted',
        acceptedHeader: 'Priority-BPM-Token',
      });
    }
  }

  return createAndEnqueue({ integration, triggerType, executionMode, payload, wait });
}

async function setWebhookToken(integration, token) {
  return String(token);
}

async function getWebhookToken(integration) {
  const saved = integration.webhookSettings && integration.webhookSettings.secretTokenReference;
  const legacyLocalReference = `${integration.id}::${WEBHOOK_TOKEN_KEY}`;
  const legacyAwsPrefix = `automation/${integration.id}/`;
  if (saved && saved !== legacyLocalReference && !saved.startsWith(legacyAwsPrefix)) {
    return saved;
  }
  return secretsStore.getSecret(integration.id, WEBHOOK_TOKEN_KEY);
}

module.exports = { runWebhook, findWebhookIntegration, setWebhookToken, getWebhookToken, WEBHOOK_TOKEN_KEY };
