/**
 * Adds permanent automation_id secret aliases without changing secret values.
 * Legacy references remain valid because the adapter keeps both namespaces.
 */
require('dotenv').config();

const prisma = require('../src/db/client');
const secrets = require('../src/core/secrets');

function isLegacyReference(reference, integrationId, key) {
  return reference === secrets.legacyRefName(integrationId, key)
    || reference === `automation/${integrationId}/${key}`
    || reference.startsWith(`arn:`) && reference.includes(`:secret:automation/${integrationId}/${key}-`);
}

async function backfillSecretNamespaces() {
  const integrations = await prisma.integration.findMany({
    where: { automationId: { not: null } },
    include: { credentials: true, webhookSettings: true },
    orderBy: { id: 'asc' },
  });
  let credentialCount = 0;
  let webhookCount = 0;

  for (const integration of integrations) {
    for (const credential of integration.credentials.filter((row) => row.isSecret)) {
      if (!isLegacyReference(credential.valueReference, integration.id, credential.key)) continue;
      const aliased = await secrets.aliasSecret(integration, credential.key, credential.valueReference);
      if (!aliased) continue;
      const canonical = secrets.automationRefName(integration.automationId, credential.key);
      if (credential.valueReference !== canonical) {
        await prisma.credential.update({
          where: { id: credential.id },
          data: { valueReference: canonical },
        });
      }
      credentialCount += 1;
    }

    const webhookReference = integration.webhookSettings?.secretTokenReference;
    if (webhookReference && isLegacyReference(webhookReference, integration.id, 'WEBHOOK_TOKEN')) {
      const aliased = await secrets.aliasSecret(integration, 'WEBHOOK_TOKEN', webhookReference);
      if (aliased) {
        await prisma.webhookSettings.update({
          where: { integrationId: integration.id },
          data: { secretTokenReference: secrets.automationRefName(integration.automationId, 'WEBHOOK_TOKEN') },
        });
        webhookCount += 1;
      }
    }
  }

  return { integrations: integrations.length, credentials: credentialCount, webhooks: webhookCount };
}

if (require.main === module) {
  backfillSecretNamespaces()
    .then(async (result) => {
      console.log(`Secret namespace backfill complete for ${result.credentials} credential(s) and ${result.webhooks} webhook token(s).`);
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error.stack || error.message);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}

module.exports = { backfillSecretNamespaces, isLegacyReference };
