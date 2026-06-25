/**
 * Jest `globalSetup` - runs once before any test file, in its own
 * process. Creates a fresh schema in the dedicated test SQLite database
 * (see tests/setup/constants.js) by running `prisma db push` against it.
 *
 * We use `db push` rather than `migrate deploy` because this project has
 * no migration history yet (SQLite is the local-dev datasource; AWS RDS
 * Postgres is intended to get real migrations - see docs/ops/aws-deployment-plan.md).
 *
 * Requires `npx prisma generate` to have been run at least once (normally
 * part of `npm install` via a postinstall, or `npm run db:generate`) so
 * @prisma/client exists - this script does not generate the client itself
 * because `--skip-generate` keeps it fast and avoids regenerating on every
 * test run.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, LOCAL_DATA_DIR, TEST_DATABASE_URL, TEST_DATABASE_FILE, TEST_SECRETS_PATH } = require('./constants');

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

module.exports = async function globalSetup() {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });

  // Start every test run from a clean database and a clean secrets file.
  for (const file of [
    TEST_DATABASE_FILE,
    `${TEST_DATABASE_FILE}-journal`,
    `${TEST_DATABASE_FILE}-wal`,
    `${TEST_DATABASE_FILE}-shm`,
    TEST_SECRETS_PATH,
  ]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  process.env.DATABASE_URL = TEST_DATABASE_URL;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const migrationPath = path.join(ROOT, 'prisma', 'migrations', '20260623223422_init', 'migration.sql');
  const statements = splitSqlStatements(fs.readFileSync(migrationPath, 'utf8'));

  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
};
