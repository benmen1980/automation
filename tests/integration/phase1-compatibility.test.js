const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const credentialsService = require('../../src/core/credentials');
const webhookRunner = require('../../src/core/webhook-runner');
const { buildSqsJobMessage, waitForExecution } = require('../../src/core/queue');
const { runScheduled } = require('../../src/core/schedule-runner');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');
const { deriveUserUid } = require('../../src/core/identity');

const CODE_FOLDER = 'src/integrations/test_fixtures/echo';
const INTEGRATION_KEY = require('../../src/integrations/test_fixtures/echo/integration').integrationKey;

describe('Phase 1 backward compatibility', () => {
  let legacyUser;
  let legacyIntegration;
  let legacyToken;

  beforeAll(async () => {
    legacyUser = await prisma.user.create({
      data: {
        slug: 'phase1_legacy_user',
        email: 'phase1-legacy-user@test.local',
        name: 'Phase 1 Legacy User',
        role: 'user',
        passwordHash: 'test-password-hash',
        status: 'active',
      },
    });
    legacyIntegration = await prisma.integration.create({
      data: {
        userId: legacyUser.id,
        name: 'Phase 1 Legacy Echo',
        description: 'Legacy compatibility fixture.',
        slug: 'legacy-echo',
        type: 'webhook',
        codeFolder: CODE_FOLDER,
        status: 'active',
      },
    });
    legacyToken = 'phase1-legacy-webhook-token';
    await credentialsService.saveCredentials(legacyIntegration, { API_TOKEN: 'legacy-api-token' });
    await prisma.webhookSettings.create({
      data: {
        integrationId: legacyIntegration.id,
        webhookUrl: `/webhooks/${legacyUser.slug}/${legacyIntegration.slug}`,
        active: true,
      },
    });
    const tokenReference = await webhookRunner.setWebhookToken(legacyIntegration, legacyToken);
    await prisma.webhookSettings.update({
      where: { integrationId: legacyIntegration.id },
      data: { secretTokenReference: tokenReference },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('legacy DB id, integration key, and integration slug continue to resolve', async () => {
    const byId = await request(app)
      .get(`/api/integrations/${legacyIntegration.id}`)
      .set('Authorization', authHeader(legacyUser));
    expect(byId.status).toBe(200);
    expect(byId.body.integration.id).toBe(legacyIntegration.id);

    const byKey = await request(app)
      .get(`/api/integrations/${INTEGRATION_KEY}`)
      .set('Authorization', authHeader(legacyUser));
    expect(byKey.status).toBe(200);
    expect(byKey.body.integration.id).toBe(legacyIntegration.id);

    const bySlugWebhook = await webhookRunner.findWebhookIntegration(legacyUser.slug, legacyIntegration.slug);
    expect(bySlugWebhook.integration.id).toBe(legacyIntegration.id);
  });

  test('legacy user id and user slug continue to resolve', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authHeader(legacyUser));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(legacyUser.id);
    expect(me.body.user.slug).toBe(legacyUser.slug);
  });

  test('legacy webhook URL executes the same automation', async () => {
    const response = await request(app)
      .post(`/webhooks/${legacyUser.slug}/${legacyIntegration.slug}`)
      .set('Authorization', `Bearer ${legacyToken}`)
      .send({ legacy: true });

    expect(response.status).toBe(200);
    const execution = await waitForExecution(response.body.execution.id);
    expect(execution.status).toBe('success');
    expect(execution.integrationId).toBe(legacyIntegration.id);
    expect(execution.triggerType).toBe('webhook');
  });

  test('legacy credential references remain unchanged and load successfully', async () => {
    const row = await prisma.credential.findUnique({
      where: { integrationId_key: { integrationId: legacyIntegration.id, key: 'API_TOKEN' } },
    });
    expect(row.valueReference).toContain(`${legacyIntegration.id}::API_TOKEN`);
    expect(await credentialsService.loadCredentialsForExecution(legacyIntegration)).toMatchObject({ API_TOKEN: 'legacy-api-token' });
  });

  test('legacy queue message fields remain dispatch-compatible', () => {
    const message = buildSqsJobMessage({
      id: 'legacy-execution',
      userId: legacyUser.id,
      integrationId: legacyIntegration.id,
      triggerType: 'manual',
      executionMode: 'test',
      inputPayload: JSON.stringify({ legacy: true }),
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      integration: {
        ...legacyIntegration,
        automationId: null,
        credentials: [{ key: 'GREETING', valueReference: JSON.stringify('hello'), isSecret: false }],
      },
      user: legacyUser,
    }, {
      INTEGRATION_WORKER_STATUS_CALLBACK_BASE_URL: 'https://automation.example.test',
    });

    expect(message).toMatchObject({
      schemaVersion: 2,
      executionId: 'legacy-execution',
      integrationId: legacyIntegration.id,
      integrationKey: INTEGRATION_KEY,
      integrationSlug: legacyIntegration.slug,
      automationId: null,
    });
  });

  test('legacy access scope remains unchanged and new records receive permanent identities', async () => {
    const otherUser = await createUser({ slug: 'phase1_other_user', email: 'phase1-other-user@test.local' });
    const newIntegration = await createIntegration({ user: otherUser, slug: 'new-echo', codeFolder: CODE_FOLDER });

    expect(legacyUser.userUid).toBeNull();
    const ownList = await request(app).get('/api/integrations').set('Authorization', authHeader(legacyUser));
    expect(ownList.status).toBe(200);
    expect(ownList.body.integrations.map((item) => item.id)).toEqual([legacyIntegration.id]);
    expect(otherUser.userUid).toMatch(/^usr_[a-f0-9]{16}$/);
    expect(newIntegration.automationId).toMatch(/^aut_[a-f0-9]{16}$/);
    expect(newIntegration.id).toBeDefined();
  });

  test('scheduled execution retains its existing trigger and execution behavior', async () => {
    const scheduled = await createIntegration({
      user: legacyUser,
      slug: 'legacy-scheduled-echo',
      type: 'scheduled',
      codeFolder: CODE_FOLDER,
    });
    await credentialsService.saveCredentials(scheduled, { API_TOKEN: 'scheduled-api-token' });
    await prisma.scheduleSettings.create({
      data: { integrationId: scheduled.id, cronExpression: '*/10 * * * *', timezone: 'UTC', active: true },
    });

    const execution = await runScheduled(scheduled, { wait: true });
    expect(execution.status).toBe('success');
    expect(execution.triggerType).toBe('scheduled');
  });

  test('identity backfill remains safe for legacy records and does not replace their IDs', async () => {
    const before = await prisma.integration.findUnique({ where: { id: legacyIntegration.id } });
    expect(before.automationId).toBeNull();
    expect(deriveUserUid(legacyUser.slug)).toMatch(/^usr_[a-f0-9]{16}$/);
    expect(before.id).toBe(legacyIntegration.id);
    expect(before.slug).toBe('legacy-echo');
  });
});
