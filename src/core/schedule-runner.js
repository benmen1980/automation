/**
 * Triggered by the local cron scheduler (core/scheduler.js) or, in
 * production, by an EventBridge-invoked endpoint. Always runs in 'live'
 * mode against triggerType 'scheduled'.
 */
const prisma = require('../db/client');
const { runExecution } = require('./execution-runner');

async function runScheduled(integration) {
  const user = await prisma.user.findUnique({ where: { id: integration.userId } });
  if (!user) throw new Error(`Owner user not found for integration ${integration.id}`);

  const execution = await runExecution({
    integration,
    user: { id: user.id, slug: user.slug, email: user.email, role: user.role },
    triggerType: 'scheduled',
    executionMode: 'live',
    payload: {},
  });

  await prisma.scheduleSettings
    .update({ where: { integrationId: integration.id }, data: { lastRunAt: new Date() } })
    .catch(() => {
      /* no ScheduleSettings row yet — ignore */
    });

  return execution;
}

module.exports = { runScheduled };
