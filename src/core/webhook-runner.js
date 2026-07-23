const prisma = require('../db/client');
const integrationLoader = require('./integration-loader');
const secretsStore = require('./secrets');
const { createAndEnqueue } = require('./manual-runner');
const { createLogger } = require('./logger');
const { redactExecutionForDisplay } = require('./execution-privacy');

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

function tokenDiagnostics({ expected, providedToken, headerName, providerHeaders }) {
  return {
    providedHeaderName: headerName || 'none',
    providedValuePresent: !!providedToken,
    savedValueConfigured: !!expected,
    valuesMatched: Boolean(expected && providedToken && providedToken === expected),
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
  let acceptedWebhookDiagnostics = null;

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
      acceptedWebhookDiagnostics = {
        ...diagnostics,
        integrationName: integration.name,
        integrationSlug: integration.slug,
        triggerType,
        status: 'accepted',
        acceptedHeader: 'Priority-BPM-Token',
      };
    }
  }

  const execution = await createAndEnqueue({ integration, triggerType, executionMode, payload, wait });
  if (acceptedWebhookDiagnostics) {
    const executionLogger = createLogger({
      userId: user.id,
      integrationId: integration.id,
      executionId: execution.id,
      executionMode,
      isTest: executionMode !== 'live',
    });
    await executionLogger.info('Accepted Priority webhook request for this execution.', {
      ...acceptedWebhookDiagnostics,
      jobId: execution.id,
    });
  }
  return redactExecutionForDisplay(integration, execution);
}

async function setWebhookToken(integration, token) {
  return secretsStore.setSecret(integration.id, WEBHOOK_TOKEN_KEY, String(token));
}

async function getWebhookToken(integration) {
  const saved = integration.webhookSettings && integration.webhookSettings.secretTokenReference;
  const legacyLocalReference = `${integration.id}::${WEBHOOK_TOKEN_KEY}`;
  const legacyAwsPrefix = `automation/${integration.id}/`;
  if (saved && saved !== legacyLocalReference && !saved.startsWith(legacyAwsPrefix)) {
    const legacyPlaintext = saved;
    const safeReference = await setWebhookToken(integration, legacyPlaintext);
    await prisma.webhookSettings.update({
      where: { integrationId: integration.id },
      data: { secretTokenReference: safeReference },
    });
    if (integration.webhookSettings) integration.webhookSettings.secretTokenReference = safeReference;
    return legacyPlaintext;
  }
  return secretsStore.getSecret(integration.id, WEBHOOK_TOKEN_KEY);
}

module.exports = { runWebhook, findWebhookIntegration, setWebhookToken, getWebhookToken, WEBHOOK_TOKEN_KEY };
