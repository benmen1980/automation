/**
 * Small test-data builders shared across integration test files. Each test
 * file should use globally-unique slugs/emails (e.g. prefixed by the
 * feature under test) since tests run --runInBand against one shared
 * SQLite file for the whole run and data is not wiped between files.
 */
const bcrypt = require('bcryptjs');
const prisma = require('../../src/db/client');
const { deriveUserUid, deriveAutomationId } = require('../../src/core/identity');

async function createUser({ slug, email, name = 'Test User', role = 'user', password = 'Password123!', status = 'active' }) {
  const passwordHash = await bcrypt.hash(password, 4); // low cost factor - tests don't need real-world hashing cost
  return prisma.user.create({ data: { slug, email, name, role, passwordHash, status, userUid: deriveUserUid(slug) } });
}

async function createIntegration({ user, slug, codeFolder, type = 'webhook', name, version, status = 'active', manualRunEnabled = true }) {
  return prisma.integration.create({
    data: {
      userId: user.id,
      assignedUserUid: user.userUid,
      automationId: deriveAutomationId({
        integrationKey: require(`../../${codeFolder}/integration`).integrationKey,
        userUid: user.userUid,
        slug,
        codeFolder,
      }),
      name: name || slug,
      version,
      description: 'Created by the automated test suite.',
      slug,
      type,
      status,
      codeFolder,
      manualRunEnabled,
    },
  });
}

module.exports = { createUser, createIntegration };
