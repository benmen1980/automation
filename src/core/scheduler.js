/**
 * Local cron scheduler. SCHEDULER_MODE=local (the dev default) reads all
 * active ScheduleSettings rows on boot and runs them in-process with
 * node-cron. SCHEDULER_MODE=aws is a no-op here — in production,
 * EventBridge Scheduler should call back into the app (e.g. an internal
 * /internal/run-scheduled/:integrationId endpoint guarded by an IAM/role
 * check) instead of relying on a long-running in-process timer, per
 * CLAUDE.md 12.4.
 */
const cron = require('node-cron');
const prisma = require('../db/client');
const { runScheduled } = require('./schedule-runner');

const SCHEDULER_MODE = process.env.SCHEDULER_MODE || 'local';
const activeJobs = new Map(); // integrationId -> cron task

function registerJob(scheduleSettings) {
  unregisterJob(scheduleSettings.integrationId);
  if (!cron.validate(scheduleSettings.cronExpression)) {
    // eslint-disable-next-line no-console
    console.error(
      `[scheduler] Invalid cron expression "${scheduleSettings.cronExpression}" for integration ${scheduleSettings.integrationId}, skipping.`
    );
    return;
  }
  const task = cron.schedule(
    scheduleSettings.cronExpression,
    async () => {
      try {
        const integration = await prisma.integration.findUnique({ where: { id: scheduleSettings.integrationId } });
        if (integration && integration.status === 'active') {
          await runScheduled(integration);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[scheduler] Scheduled run failed for integration ${scheduleSettings.integrationId}:`, err.message);
      }
    },
    { timezone: scheduleSettings.timezone || 'UTC' }
  );
  activeJobs.set(scheduleSettings.integrationId, task);
}

function unregisterJob(integrationId) {
  const existing = activeJobs.get(integrationId);
  if (existing) {
    existing.stop();
    activeJobs.delete(integrationId);
  }
}

async function start() {
  if (SCHEDULER_MODE !== 'local') {
    // eslint-disable-next-line no-console
    console.log(`[scheduler] SCHEDULER_MODE=${SCHEDULER_MODE}: local cron scheduler not started.`);
    return;
  }
  const settings = await prisma.scheduleSettings.findMany({ where: { active: true } });
  for (const setting of settings) registerJob(setting);
  // eslint-disable-next-line no-console
  console.log(`[scheduler] Started with ${settings.length} active schedule(s).`);
}

/**
 * Called by execution-routes/integration-routes after a ScheduleSettings
 * row is created/updated/deleted, so the in-process scheduler picks up
 * the change without a server restart.
 */
async function refreshJob(integrationId) {
  if (SCHEDULER_MODE !== 'local') return;
  const setting = await prisma.scheduleSettings.findUnique({ where: { integrationId } });
  if (!setting || !setting.active) {
    unregisterJob(integrationId);
    return;
  }
  registerJob(setting);
}

module.exports = { start, refreshJob, unregisterJob };
