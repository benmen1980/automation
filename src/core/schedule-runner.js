const prisma = require('../db/client');
const { createAndEnqueue } = require('./manual-runner');

async function runScheduled(integration, { wait = false } = {}) {
  const user = await prisma.user.findUnique({ where: { id: integration.userId } });
  if (!user) throw new Error(`Owner user not found for integration ${integration.id}`);

  const execution = await createAndEnqueue({
    integration,
    triggerType: 'scheduled',
    executionMode: 'live',
    payload: {},
    wait,
  });

  await prisma.scheduleSettings
    .update({ where: { integrationId: integration.id }, data: { lastRunAt: new Date() } })
    .catch(() => {});

  return execution;
}

module.exports = { runScheduled };
