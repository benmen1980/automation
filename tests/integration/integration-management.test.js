const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const credentialsService = require('../../src/core/credentials');
const webhookRunner = require('../../src/core/webhook-runner');
const { waitForExecution } = require('../../src/core/queue');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

describe('integration management', () => {
  let admin, user1, user2, viewer;

  beforeAll(async () => {
    admin = await createUser({ slug: 'mgmt_admin', email: 'mgmt-admin@test.local', role: 'admin' });
    user1 = await createUser({ slug: 'mgmt_user_1', email: 'mgmt-user-1@test.local' });
    user2 = await createUser({ slug: 'mgmt_user_2', email: 'mgmt-user-2@test.local' });
    viewer = await createUser({ slug: 'mgmt_viewer', email: 'mgmt-viewer@test.local', role: 'viewer' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('normal integration list is scoped to the signed-in user; admins can request all explicitly', async () => {
    await createIntegration({ user: user1, slug: 'owned-one', codeFolder: 'src/integrations/test_fixtures/echo' });
    await createIntegration({ user: user2, slug: 'owned-two', codeFolder: 'src/integrations/test_fixtures/echo' });

    const userRes = await request(app).get('/api/integrations').set('Authorization', authHeader(user1));
    expect(userRes.status).toBe(200);
    expect(userRes.body.integrations.every((integration) => integration.userId === user1.id)).toBe(true);

    const adminOwnRes = await request(app).get('/api/integrations').set('Authorization', authHeader(admin));
    expect(adminOwnRes.status).toBe(200);
    expect(adminOwnRes.body.integrations.every((integration) => integration.userId === admin.id)).toBe(true);

    const adminAllRes = await request(app).get('/api/integrations?scope=all').set('Authorization', authHeader(admin));
    expect(adminAllRes.status).toBe(200);
    expect(adminAllRes.body.integrations.some((integration) => integration.userId === user1.id)).toBe(true);
    expect(adminAllRes.body.integrations.some((integration) => integration.userId === user2.id)).toBe(true);
  });

  test('delete removes an owned integration and dependent rows', async () => {
    const integration = await createIntegration({
      user: user1,
      slug: 'delete-me',
      codeFolder: 'src/integrations/test_fixtures/echo',
    });
    await credentialsService.saveCredentials(integration, { API_TOKEN: 'delete-secret' });
    await prisma.log.create({
      data: {
        userId: user1.id,
        integrationId: integration.id,
        level: 'info',
        message: 'delete cleanup log',
      },
    });

    const res = await request(app).delete(`/api/integrations/${integration.id}`).set('Authorization', authHeader(user1));
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    await expect(prisma.integration.findUnique({ where: { id: integration.id } })).resolves.toBeNull();
    await expect(prisma.credential.count({ where: { integrationId: integration.id } })).resolves.toBe(0);
    await expect(prisma.log.count({ where: { integrationId: integration.id } })).resolves.toBe(0);
  });

  test('only admins can register generated integrations', async () => {
    const userRes = await request(app)
      .post('/api/integrations')
      .set('Authorization', authHeader(user1))
      .send({
        name: 'User Created Echo',
        type: 'webhook',
        codeFolder: 'src/integrations/test_fixtures/echo',
      });
    expect(userRes.status).toBe(403);

    const adminRes = await request(app)
      .post('/api/integrations')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Admin Created Echo',
        type: 'webhook',
        codeFolder: 'src/integrations/test_fixtures/echo',
      });
    expect(adminRes.status).toBe(201);
  });

  test('admins can register generated integrations for another user', async () => {
    const adminRes = await request(app)
      .post('/api/integrations')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Assigned Echo',
        type: 'webhook',
        codeFolder: 'src/integrations/test_fixtures/echo',
        userId: user1.id,
      });

    expect(adminRes.status).toBe(201);
    expect(adminRes.body.integration.userId).toBe(user1.id);

    const userRes = await request(app).get('/api/integrations').set('Authorization', authHeader(user1));
    expect(userRes.body.integrations.some((item) => item.id === adminRes.body.integration.id)).toBe(true);
  });

  test('users can update an owned integration name and private version', async () => {
    const integration = await createIntegration({
      user: user1,
      slug: 'editable-version',
      codeFolder: 'src/integrations/test_fixtures/echo',
    });

    const res = await request(app)
      .patch(`/api/integrations/${integration.id}`)
      .set('Authorization', authHeader(user1))
      .send({ name: 'Renamed Echo', version: '2.4.1-private' });

    expect(res.status).toBe(200);
    expect(res.body.integration.name).toBe('Renamed Echo');
    expect(res.body.integration.version).toBe('2.4.1-private');
  });

  test('viewer can inspect but cannot mutate or run an owned integration', async () => {
    const integration = await createIntegration({
      user: viewer,
      slug: 'viewer-echo',
      codeFolder: 'src/integrations/test_fixtures/echo',
    });

    const listRes = await request(app).get('/api/integrations').set('Authorization', authHeader(viewer));
    expect(listRes.status).toBe(200);
    expect(listRes.body.integrations.some((item) => item.id === integration.id)).toBe(true);

    const saveRes = await request(app)
      .post(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(viewer))
      .send({ values: { API_TOKEN: 'viewer-secret' } });
    expect(saveRes.status).toBe(403);

    const runRes = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(viewer))
      .send({ executionMode: 'test', payload: { hello: 'viewer' } });
    expect(runRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/integrations/${integration.id}`).set('Authorization', authHeader(viewer));
    expect(deleteRes.status).toBe(403);
  });
});

describe('user_001 WhatsApp body file webhook', () => {
  let user, integration;
  const outputDir = path.join(process.cwd(), 'local-data', 'users', 'file_webhook_user', 'user-001-whatsapp');

  beforeAll(async () => {
    fs.rmSync(outputDir, { recursive: true, force: true });
    user = await createUser({ slug: 'file_webhook_user', email: 'file-webhook-user@test.local' });
    integration = await createIntegration({
      user,
      slug: 'user-001-whatsapp',
      name: 'User 001 WhatsApp Webhook',
      codeFolder: 'src/integrations/user_001/user-001-whatsapp',
    });
    await credentialsService.saveCredentials(integration, {
      LOCAL_OUTPUT_DIR: 'local-data/users/file_webhook_user/user-001-whatsapp',
    });
    await prisma.webhookSettings.create({
      data: {
        integrationId: integration.id,
        webhookUrl: `/webhooks/${user.slug}/${integration.slug}`,
        active: true,
      },
    });
    const secretTokenReference = await webhookRunner.setWebhookToken(integration, 'file-webhook-token');
    await prisma.webhookSettings.update({ where: { integrationId: integration.id }, data: { secretTokenReference } });
  });

  afterAll(async () => {
    fs.rmSync(outputDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test('writes the received webhook body to a local JSON file', async () => {
    const payload = { from: '+972501234567', message: 'hello file' };
    const res = await request(app)
      .post(`/webhooks/${user.slug}/${integration.slug}`)
      .set('Authorization', 'Bearer file-webhook-token')
      .send(payload);

    expect(res.status).toBe(200);
    const stored = await waitForExecution(res.body.execution.id);
    expect(stored.status).toBe('success');
    const output = JSON.parse(stored.outputPayload);
    expect(output.filePath).toContain('user-001-whatsapp');

    const written = JSON.parse(fs.readFileSync(output.filePath, 'utf8'));
    expect(written.body).toEqual(payload);
  });
});
