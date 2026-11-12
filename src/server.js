require('dotenv').config();
const app = require('./app');
const scheduler = require('./core/scheduler');
const { schedulerEnabled, watchdogEnabled } = require('./core/deployment-safety');

const PORT = process.env.PORT || 3000;

async function main() {
  if (schedulerEnabled()) await scheduler.start();
  if (watchdogEnabled()) require('./core/execution-telemetry').startWatchdog();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Automation platform listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
