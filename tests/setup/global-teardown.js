/**
 * Jest `globalTeardown` - runs once after every test file has finished.
 * Removes the test database and test secrets file so each `npm test` run
 * starts from a clean slate (mirrors what globalSetup does at the start).
 */
const fs = require('fs');
const path = require('path');
const { TEST_DATABASE_FILE, TEST_SECRETS_PATH } = require('./constants');

module.exports = async function globalTeardown() {
  for (const file of [
    TEST_DATABASE_FILE,
    `${TEST_DATABASE_FILE}-journal`,
    `${TEST_DATABASE_FILE}-wal`,
    `${TEST_DATABASE_FILE}-shm`,
    TEST_SECRETS_PATH,
  ]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
};
