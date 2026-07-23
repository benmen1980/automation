const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { isAdmin } = require('../core/permissions');
const integrationLoader = require('../core/integration-loader');
const credentialsService = require('../core/credentials');
const secrets = require('../core/secrets');
const { slugify } = require('../utils/slugify');
const { buildPublicUrl } = require('../core/public-url');
const webhookRunner = require('../core/webhook-runner');
const scheduler = require('../core/scheduler');

router.use(requireAuth);

const WITH_SETTINGS = { webhookSettings: true, scheduleSettings: true };

function withPublicWebhookUrl(integration, req) {
  if (!integration || !integration.webhookSettings?.webhookUrl) return integration;
  const integrationKey = getIntegrationCodeKey(integration);
  return {
    ...integration,
    webhookSettings: {
      ...integration.webhookSettings,
      webhookUrl: buildPublicUrl(`/webhooks/${integrationKey}`, req),
      secretTokenReference: integration.webhookSettings.secretTokenReference ? '[configured]' : null,
    },
  };
}

function getIntegrationCodeKey(integration) {
  let integrationKey = integration.id;
  try {
    integrationKey = integrationLoader.loadDefinition(integration)?.integrationKey || integration.id;
  } catch {
    integrationKey = integration.id;
  }
  return integrationKey;
}

function withIntegrationCodeKey(integration) {
  if (!integration) return integration;
  return { ...integration, integrationKey: getIntegrationCodeKey(integration) };
}

router.get('/', async (req, res) => {
  const where = req.query.scope === 'all' && isAdmin(req.user) ? {} : { userId: req.user.id };
  const integrations = await prisma.integration.findMany({
    where,
    orderBy: [{ name: 'asc' }, { codeFolder: 'asc' }],
    include: WITH_SETTINGS,
  });
  res.json({ integrations: integrations.map((integration) => withIntegrationCodeKey(withPublicWebhookUrl(integration, req))) });
});

// docs/product/product-architecture-spec.md 8.3: admin (or self-service user) registers an integration
// that already has integration.js + handler.js on disk under a
// codeFolder. We validate those files exist before ever saving the row.
router.post('/', async (req, res) => {
  const { name, version, description, slug, type, codeFolder, userId, definitionFile, handlerFile } = req.body || {};
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only admins can register generated integrations. Ask an admin to create or assign a new integration.' });
  }
  if (!name || !type || !codeFolder) {
    return res.status(400).json({ error: 'name, type, and codeFolder are required.' });
  }
  if (version !== undefined && !String(version).trim()) {
    return res.status(400).json({ error: 'version cannot be empty.' });
  }
  if (!['webhook', 'scheduled'].includes(type)) {
    return res.status(400).json({ error: 'type must be "webhook" or "scheduled".' });
  }

  const ownerId = userId || req.user.id;
  if (ownerId !== req.user.id && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only an admin may create an integration for another user.' });
  }

  try {
    const { definitionPath } = integrationLoader.validateIntegrationFiles(codeFolder, definitionFile, handlerFile);
    const definition = integrationLoader.loadDefinitionFromPath(definitionPath);
    integrationLoader.validateIntegrationContract(definition, { strict: true });
  } catch (err) {
    return res.status(400).json({ error: `Integration code is invalid: ${err.message}` });
  }

  const finalSlug = slugify(slug || name);

  try {
    const integration = await prisma.integration.create({
      data: {
        userId: ownerId,
        name,
        version: version ? String(version).trim() : undefined,
        description,
        slug: finalSlug,
        type,
        codeFolder,
        definitionFile: definitionFile || 'integration.js',
        handlerFile: handlerFile || 'handler.js',
      },
    });
    res.status(201).json({ integration: withIntegrationCodeKey(integration) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An integration with this slug already exists for this user.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', loadIntegration({ mutate: true }), async (req, res) => {
  try {
    scheduler.unregisterJob(req.integration.id);
    await prisma.$transaction(async (tx) => {
      const credentials = await tx.credential.findMany({ where: { integrationId: req.integration.id } });
      const secretKeys = credentials.filter((row) => row.isSecret).map((row) => row.key);
      const executionIds = (
        await tx.execution.findMany({
          where: { integrationId: req.integration.id },
          select: { id: true },
        })
      ).map((execution) => execution.id);

      await tx.log.deleteMany({
        where: {
          OR: [
            { integrationId: req.integration.id },
            executionIds.length ? { executionId: { in: executionIds } } : { executionId: '__never__' },
          ],
        },
      });
      await tx.credential.deleteMany({ where: { integrationId: req.integration.id } });
      await tx.webhookSettings.deleteMany({ where: { integrationId: req.integration.id } });
      await tx.scheduleSettings.deleteMany({ where: { integrationId: req.integration.id } });
      await tx.execution.deleteMany({ where: { integrationId: req.integration.id } });
      await tx.integration.delete({ where: { id: req.integration.id } });

      req.deletedSecretKeys = secretKeys;
    });

    await Promise.all(
      [...(req.deletedSecretKeys || []), 'WEBHOOK_TOKEN'].map((key) =>
        secrets.deleteSecret(req.integration.id, key).catch(() => {})
      )
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:id', loadIntegration({ include: WITH_SETTINGS }), (req, res) => {
  res.json({ integration: withIntegrationCodeKey(withPublicWebhookUrl(req.integration, req)) });
});

router.patch('/:id', loadIntegration({ mutate: true }), async (req, res) => {
  const { name, version, description, status, manualRunEnabled, userId } = req.body || {};
  const data = {};
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ error: 'name cannot be empty.' });
    data.name = trimmedName;
  }
  if (version !== undefined) {
    const trimmedVersion = String(version).trim();
    if (!trimmedVersion) return res.status(400).json({ error: 'version cannot be empty.' });
    data.version = trimmedVersion;
  }
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (manualRunEnabled !== undefined) data.manualRunEnabled = manualRunEnabled;
  if (userId !== undefined) {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can reassign an automation to another user.' });
    }
    const trimmedUserId = String(userId).trim();
    if (!trimmedUserId) return res.status(400).json({ error: 'userId cannot be empty.' });
    const owner = await prisma.user.findUnique({ where: { id: trimmedUserId } });
    if (!owner) return res.status(400).json({ error: 'Selected user does not exist.' });
    data.userId = owner.id;
  }

  try {
    const integration = await prisma.integration.update({ where: { id: req.integration.id }, data });
    res.json({ integration: withIntegrationCodeKey(integration) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An integration with this slug already exists for this user.' });
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:id/definition', loadIntegration(), (req, res) => {
  try {
    const definition = integrationLoader.loadDefinition(req.integration);
    // integration.js must never carry real secret values (docs/product/product-architecture-spec.md 5.3),
    // but as a defense-in-depth measure we still strip any defaultValue
    // on secret-type fields before this reaches the frontend.
    const safeCredentials = (definition.credentials || []).map((field) => {
      if (field.type === 'secret' || field.type === 'password' || field.isSecret) {
        const { defaultValue, ...rest } = field;
        return rest;
      }
      return field;
    });
    res.json({ definition: { ...definition, credentials: safeCredentials } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/credentials', loadIntegration(), async (req, res) => {
  try {
    const credentials = await credentialsService.listCredentialsForDisplay(req.integration);
    res.json({ credentials });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:id/credentials', loadIntegration({ mutate: true }), async (req, res) => {
  const values = req.body && req.body.values;
  if (!values || typeof values !== 'object') {
    return res.status(400).json({ error: '"values" object is required.' });
  }
  try {
    const saved = await credentialsService.saveCredentials(req.integration, values);
    res.json({ saved });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:id/webhook-token', loadIntegration({ mutate: true, include: WITH_SETTINGS }), async (req, res) => {
  if (req.integration.type !== 'webhook') {
    return res.status(400).json({ error: 'Only webhook integrations have webhook tokens.' });
  }
  try {
    const token = await webhookRunner.getWebhookToken(req.integration);
    res.json({ configured: Boolean(token), token: null });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:id/webhook-settings', loadIntegration({ mutate: true }), async (req, res) => {
  if (req.integration.type !== 'webhook') {
    return res.status(400).json({ error: 'Only webhook integrations have webhook settings.' });
  }
  const { token, active } = req.body || {};
  const webhookPath = `/webhooks/${getIntegrationCodeKey(req.integration)}`;
  const data = { webhookUrl: webhookPath };
  if (active !== undefined) data.active = active;
  if (token) data.secretTokenReference = await webhookRunner.setWebhookToken(req.integration, token);

  const settings = await prisma.webhookSettings.upsert({
    where: { integrationId: req.integration.id },
    update: data,
    create: { integrationId: req.integration.id, ...data },
  });

  // Never echo back the actual reference name in detail ג€” just whether a
  // token has been configured, same masking rule as secret credentials.
  res.json({
    webhookSettings: {
      ...settings,
      webhookUrl: buildPublicUrl(settings.webhookUrl, req),
      secretTokenReference: settings.secretTokenReference ? '[configured]' : null,
    },
  });
});

router.post('/:id/schedule-settings', loadIntegration({ mutate: true }), async (req, res) => {
  if (req.integration.type !== 'scheduled') {
    return res.status(400).json({ error: 'Only scheduled integrations have schedule settings.' });
  }
  const { cronExpression, timezone, active } = req.body || {};
  const data = {};
  if (cronExpression !== undefined) data.cronExpression = cronExpression;
  if (timezone !== undefined) data.timezone = timezone;
  if (active !== undefined) data.active = active;

  const settings = await prisma.scheduleSettings.upsert({
    where: { integrationId: req.integration.id },
    update: data,
    create: {
      integrationId: req.integration.id,
      cronExpression: cronExpression || '0 2 * * *',
      timezone: timezone || 'UTC',
      active: active === undefined ? true : active,
    },
  });

  await scheduler.refreshJob(req.integration.id);
  res.json({ scheduleSettings: settings });
});

module.exports = router;

