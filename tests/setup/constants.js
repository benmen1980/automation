/**
 * Shared paths for the test database and test secrets store. Centralized
 * here so test-env.js (per-test-file env vars), global-setup.js (creates
 * the test DB schema once before any test file runs), and
 * global-teardown.js (cleans up after the whole run) all agree on the
 * exact same locations.
 *
 * NOTE on the DATABASE_URL value: Prisma resolves a relative `file:` SQLite
 * path relative to prisma/schema.prisma's directory, not process.cwd().
 * So "file:../local-data/test.db" lands at <project-root>/local-data/test.db
 * - a sibling of dev.db, never touching it.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_DATA_DIR = path.join(ROOT, 'local-data');

module.exports = {
  ROOT,
  LOCAL_DATA_DIR,
  TEST_DATABASE_URL: 'file:../local-data/test.db',
  TEST_DATABASE_FILE: path.join(LOCAL_DATA_DIR, 'test.db'),
  TEST_SECRETS_PATH: path.join(LOCAL_DATA_DIR, 'secrets.test.json'),
};
