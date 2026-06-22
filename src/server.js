require('dotenv').config();
const app = require('./app');
const scheduler = require('./core/scheduler');

const PORT = process.env.PORT || 3000;

async function main() {
  await scheduler.start();
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
