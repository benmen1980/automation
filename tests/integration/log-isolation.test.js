/**
 * docs/product/product-architecture-spec.md 9.9 / 10.1: a user can only see their own logs; an admin can
 * see everyone's. Covers both log routes (by integration, and directly by
 * executionId).
 */
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

const CODE_FOLDER = 'src/integrations/test_fixtures/echo';

describe('log isolation between users', () => {
  let admin, user1, user2, integration1, integration2;

  beforeAll(async () => {
    admin = await createUser({ slug: 'log_iso_admin', email: 'log-iso-admin@test.local', role: 'admin' });
    user1 = await createUser({ slug: 'log_iso_user1', email: 'log-iso-user1@test.local' });
    user2 = await createUser({ slug: 'log_iso_user2', email: 'log-iso-user2@test.local' });
    integration1 = await createIntegration({ user: user1, slug: 'echo-1', codeFolder: CODE_FOLDER });
    integration2 = await createIntegration({ user: user2, slug: 'echo-2', codeFolder: CODE_FOLDER });

    // No credentials saved, so each run fails fast on the missing-credential
    // check - that's fine, a failed execution still writes log rows via the
    // shared logger (logger.info('Execution started.') always runs first).
    await request(app)
      .post(`/api/integrations/${integration1.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test', payload: {} });
    await request(app)
      .post(`/api/integrations/${integration2.id}/run`)
      .set('Authorization', authHeader(user2))
      .send({ executionMode: 'test', payload: {} });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('a user can read logs for their own integration', async () => {
    const res = await request(app)
      .get(`/api/integrations/${integration1.id}/logs`)
      .set('Authorization', authHeader(user1));
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.every((l) => l.integrationId === integration1.id)).toBe(true);
  });

  test("a user cannot read another user's integration logs", async () => {
    const res = await request(app)
      .get(`/api/integrations/${integration2.id}/logs`)
      .set('Authorization', authHeader(user1));
    expect(res.status).toBe(403);
  });

  test('an admin can read any integration logs', async () => {
    const res = await request(app)
      .get(`/api/integrations/${integration2.id}/logs`)
      .set('Authorization', authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });

  test("a user cannot read another user's execution logs by executionId either", async () => {
    const exec = await prisma.execution.findFirst({ where: { integrationId: integration2.id } });
    const res = await request(app)
      .get(`/api/executions/${exec.id}/logs`)
      .set('Authorization', authHeader(user1));
    expect(res.status).toBe(403);
  });

  test('an admin can read execution logs by executionId for any user', async () => {
    const exec = await prisma.execution.findFirst({ where: { integrationId: integration2.id } });
    const res = await request(app)
      .get(`/api/executions/${exec.id}/logs`)
      .set('Authorization', authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });
});
