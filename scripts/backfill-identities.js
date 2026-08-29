/**
 * Idempotently populates the additive permanent identity fields for existing
 * users and integrations. Legacy IDs, keys, URLs, credentials, and runtime
 * behavior are intentionally unchanged.
 */
require('dotenv').config();

const prisma = require('../src/db/client');
const integrationLoader = require('../src/core/integration-loader');
const {
  deriveUserUid,
  deriveAutomationId,
  getIntegrationKeyFromDefinition,
} = require('../src/core/identity');

async function backfillIdentities() {
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  const userUidById = new Map();

  for (const user of users) {
    const userUid = user.userUid || deriveUserUid(user.slug);
    if (!user.userUid) await prisma.user.update({ where: { id: user.id }, data: { userUid } });
    userUidById.set(user.id, userUid);
  }

  const integrations = await prisma.integration.findMany({ orderBy: { id: 'asc' } });
  for (const integration of integrations) {
    if (integration.automationId) continue;
    let definition = null;
    try {
      definition = integrationLoader.loadDefinition(integration, { bypassCache: true });
    } catch {
      // Stable DB fields are sufficient when legacy code is absent in this checkout.
    }
    const automationId = deriveAutomationId({
      integrationKey: getIntegrationKeyFromDefinition(definition),
      userUid: userUidById.get(integration.userId),
      slug: integration.slug,
      codeFolder: integration.codeFolder,
    });
    await prisma.integration.update({ where: { id: integration.id }, data: { automationId } });
  }
}

if (require.main === module) {
  backfillIdentities()
    .then(async () => {
      console.log('Permanent identity backfill complete.');
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error.stack || error.message);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}

module.exports = { backfillIdentities };
