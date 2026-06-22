/**
 * Jest `globalSetup` - runs once before any test file, in its own
 * process. Creates a fresh schema in the dedicated test SQLite database
 * (see tests/setup/constants.js) by running `prisma db push` against it.
 *
 * We use `db push` rather than `migrate deploy` because this project has
 * no migration history yet (SQLite is the local-dev datasource; AWS RDS
 * Postgres is intended to get real migrations - see DEPLOYMENT.md).
 *
 * Requires `npx prisma generate` to have been run at least once (normally
 * part of `npm install` via a postinstall, or `npm run db:generate`) so
 * @prisma/client exists - this script does not generate the client itself
 * because `--skip-generate` keeps it fast and avoids regenerating on every
 * test run.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ROOT, LOCAL_DATA_DIR, TEST_DATABASE_URL, TEST_DATABASE_FILE, TEST_SECRETS_PATH } = require('./constants');

module.exports = async function globalSetup() {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });

  // Start every test run from a clean database and a clean secrets file.
  for (const file of [TEST_DATABASE_FILE, `${TEST_DATABASE_FILE}-journal`, TEST_SECRETS_PATH]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
};
