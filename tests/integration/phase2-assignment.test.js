const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const credentialsService = require('../../src/core/credentials');
const webhookRunner = require('../../src/core/webhook-runner');
const { waitForExecution } = require('../../src/core/queue');
const { runScheduled } = require('../../src/core/schedule-runner');
const executionService = require('../../src/core/execution-service');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

const CODE_FOLDER = 'src/integrations/test_fixtures/echo';
const INTEGRATION_KEY = require('../../src/integrations/test_fixtures/echo/integration').integrationKey;

describe('Phase 2 automation assignment and authorization', () => {
  let admin;
  let userA;
  let userB;
  let viewer;
  let assigned;
  let unassigned;

  beforeAll(async () => {
    admin = await createUser({ slug: 'phase2_admin', email: 'phase2-admin@test.local', role: 'admin' });
    userA = await createUser({ slug: 'phase2_user_a', email: 'phase2-user-a@test.local' });
    userB = await createUser({ slug: 'phase2_user_b', email: 'phase2-user-b@test.local' });
    viewer = await createUser({ slug: 'phase2_viewer', email: 'phase2-viewer@test.local', role: 'viewer' });
    assigned = await createIntegration({ user: userA, slug: 'phase2-assigned', codeFolder: CODE_FOLDER });
    unassigned = await createIntegration({ user: userA, slug: 'phase2-unassigned', codeFolder: CODE_FOLDER });
    await prisma.integration.update({ where: { id: unassigned.id }, data: { assignedUserUid: null } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('existing relationships and identities survive assignment migration', async () => {
    const row = await prisma.integration.findUnique({ where: { id: assigned.id } });
    expect(row.userId).toBe(userA.id);
    expect(row.automationId).toBe(assigned.automationId);
    expect(row.slug).toBe('phase2-assigned');
    expect(row.assignedUserUid).toBe(userA.userUid);
    expect(unassigned.userId).toBe(userA.id);
    expect(unassigned.automationId).toBeTruthy();
  });

  test('users see only assignments, while Admin sees assigned and unassigned automations', async () => {
    const aList = await request(app).get('/api/integrations').set('Authorization', authHeader(userA));
    expect(aList.status).toBe(200);
    expect(aList.body.integrations.map((item) => item.id)).toContain(assigned.id);
    expect(aList.body.integrations.map((item) => item.id)).not.toContain(unassigned.id);

    const bList = await request(app).get('/api/integrations').set('Authorization', authHeader(userB));
    expect(bList.status).toBe(200);
    expect(bList.body.integrations).toEqual([]);

    const adminList = await request(app).get('/api/integrations?scope=all').set('Authorization', authHeader(admin));
    expect(adminList.status).toBe(200);
    expect(adminList.body.integrations.map((item) => item.id)).toEqual(expect.arrayContaining([assigned.id, unassigned.id]));
  });

  test('only Admin can assign, reassign, and remove assignment using userUid', async () => {
    const denied = await request(app)
      .patch(`/api/integrations/${assigned.id}/assignment`)
      .set('Authorization', authHeader(userA))
      .send({ userUid: userB.userUid });
    expect(denied.status).toBe(403);

    const assign = await request(app)
      .patch(`/api/integrations/${unassigned.id}/assignment`)
      .set('Authorization', authHeader(admin))
      .send({ userUid: userA.userUid });
    expect(assign.status).toBe(200);
    expect(assign.body.integration.assignedUserUid).toBe(userA.userUid);

    const reassign = await request(app)
      .patch(`/api/integrations/${assigned.id}/assignment`)
      .set('Authorization', authHeader(admin))
      .send({ userUid: userB.userUid });
    expect(reassign.status).toBe(200);
    expect(reassign.body.integration.assignedUserUid).toBe(userB.userUid);

    const aAfter = await request(app).get(`/api/integrations/${assigned.id}`).set('Authorization', authHeader(userA));
    const bAfter = await request(app).get(`/api/integrations/${assigned.id}`).set('Authorization', authHeader(userB));
    expect(aAfter.status).toBe(403);
    expect(bAfter.status).toBe(200);

    const remove = await request(app)
      .patch(`/api/integrations/${assigned.id}/assignment`)
      .set('Authorization', authHeader(admin))
      .send({ userUid: null });
    expect(remove.status).toBe(200);
    expect(remove.body.integration.assignedUserUid).toBeNull();
    expect((await request(app).get(`/api/integrations/${assigned.id}`).set('Authorization', authHeader(userB))).status).toBe(403);
    expect((await request(app).get(`/api/integrations/${assigned.id}`).set('Authorization', authHeader(admin))).status).toBe(200);
  });

  test('a user cannot access another user automation, credentials, executions, logs, actions, or configuration', async () => {
    const target = await createIntegration({ user: userB, slug: 'phase2-protected', codeFolder: CODE_FOLDER });
    await credentialsService.saveCredentials(target, { API_TOKEN: 'phase2-protected-token' });
    const execution = await executionService.createExecution({
      userId: userB.id,
      integrationId: target.id,
      triggerType: 'manual',
      executionMode: 'test',
      inputPayload: { protected: true },
    });
    await prisma.log.create({ data: { userId: userB.id, integrationId: target.id, executionId: execution.id, message: 'protected log' } });
    const auth = { Authorization: authHeader(userA) };

    const responses = await Promise.all([
      request(app).get(`/api/integrations/${target.id}`).set(auth),
      request(app).get(`/api/integrations/${target.id}/credentials`).set(auth),
      request(app).get(`/api/integrations/${target.id}/executions`).set(auth),
      request(app).get(`/api/integrations/${target.id}/logs`).set(auth),
      request(app).get(`/api/integrations/${target.id}/definition`).set(auth),
      request(app).patch(`/api/integrations/${target.id}`).set(auth).send({ name: 'not allowed' }),
      request(app).post(`/api/integrations/${target.id}/credentials`).set(auth).send({ values: { API_TOKEN: 'nope' } }),
      request(app).post(`/api/integrations/${target.id}/run`).set(auth).send({ executionMode: 'test' }),
      request(app).post(`/api/integrations/${target.id}/test`).set(auth).send({ executionMode: 'test' }),
      request(app).post(`/api/integrations/${target.id}/dry-run`).set(auth).send({}),
      request(app).get(`/api/executions/${execution.id}`).set(auth),
      request(app).get(`/api/executions/${execution.id}/logs`).set(auth),
      request(app).post(`/api/executions/${execution.id}/replay`).set(auth).send({ executionMode: 'test' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual(responses.map(() => 403));
  });

  test('viewer retains inspect-only behavior for an assigned automation', async () => {
    const viewerIntegration = await createIntegration({ user: viewer, slug: 'phase2-viewer', codeFolder: CODE_FOLDER });
    const list = await request(app).get('/api/integrations').set('Authorization', authHeader(viewer));
    expect(list.status).toBe(200);
    expect(list.body.integrations.map((item) => item.id)).toContain(viewerIntegration.id);

    const assign = await request(app)
      .patch(`/api/integrations/${viewerIntegration.id}/assignment`)
      .set('Authorization', authHeader(admin))
      .send({ userUid: viewer.userUid });
    expect(assign.status).toBe(200);

    expect((await request(app).get(`/api/integrations/${viewerIntegration.id}`).set('Authorization', authHeader(viewer))).status).toBe(200);
    expect((await request(app).post(`/api/integrations/${viewerIntegration.id}/run`).set('Authorization', authHeader(viewer)).send({ executionMode: 'test' })).status).toBe(403);
  });

  test('legacy integration key and slug webhook execution remains unchanged', async () => {
    const webhookIntegration = await createIntegration({ user: userA, slug: 'phase2-webhook', codeFolder: CODE_FOLDER });
    await credentialsService.saveCredentials(webhookIntegration, { API_TOKEN: 'phase2-webhook-api-token' });
    await prisma.webhookSettings.create({
      data: { integrationId: webhookIntegration.id, webhookUrl: `/webhooks/${INTEGRATION_KEY}`, active: true },
    });
    await prisma.webhookSettings.update({
      where: { integrationId: webhookIntegration.id },
      data: { secretTokenReference: await webhookRunner.setWebhookToken(webhookIntegration, 'phase2-webhook-token') },
    });

    const response = await request(app)
      .post(`/webhooks/${userA.slug}/${webhookIntegration.slug}`)
      .set('Authorization', 'Bearer phase2-webhook-token')
      .send({ phase2: 'webhook' });
    expect(response.status).toBe(200);
    const execution = await waitForExecution(response.body.execution.id);
    expect(execution.status).toBe('success');
    expect(execution.integrationId).toBe(webhookIntegration.id);
    expect(webhookIntegration.automationId).toBeTruthy();
    expect(webhookIntegration.slug).toBe('phase2-webhook');
  });

  test('existing scheduled execution remains unchanged after assignment removal', async () => {
    const scheduled = await createIntegration({ user: userA, slug: 'phase2-scheduled', type: 'scheduled', codeFolder: CODE_FOLDER });
    await credentialsService.saveCredentials(scheduled, { API_TOKEN: 'phase2-scheduled-api-token' });
    await prisma.scheduleSettings.create({
      data: { integrationId: scheduled.id, cronExpression: '*/10 * * * *', timezone: 'UTC', active: true },
    });
    await prisma.integration.update({ where: { id: scheduled.id }, data: { assignedUserUid: null } });

    const execution = await runScheduled(scheduled, { wait: true });
    expect(execution.status).toBe('success');
    expect(execution.triggerType).toBe('scheduled');
  });
});
