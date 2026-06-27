/**
 * End-to-end coverage of docs/product/product-architecture-spec.md 9.9's minimum test list, driven through
 * the real Express app via supertest (not mocked) so route wiring,
 * middleware, and the core engine are all exercised together:
 *
 *   - missing required credential blocks execution
 *   - secret fields are not returned to frontend
 *   - manual test creates an execution record
 *   - dry_run does not call the real connector
 *   - mock_output uses the mock connector
 *   - replay creates a new execution with the copied payload
 *   - failed handler writes a failed execution status
 *   - webhook creates an execution record (+ token validation)
 *
 * All tests in this file share ONE integration (the test_fixtures/echo
 * fixture) and run in declaration order on purpose: the first test
 * deliberately runs before any credential has been saved.
 */
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const { waitForExecution } = require('../../src/core/queue');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

const CODE_FOLDER = 'src/integrations/test_fixtures/echo';

describe('execution flow (echo fixture)', () => {
  let user1, integration;

  beforeAll(async () => {
    user1 = await createUser({ slug: 'exec_flow_user', email: 'exec-flow-user@test.local' });
    integration = await createIntegration({ user: user1, slug: 'echo-fixture', codeFolder: CODE_FOLDER });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('running without saved credentials fails the execution (missing required credential blocks execution)', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test', payload: { hello: 'world' } });

    expect(res.status).toBe(200);
    expect(res.body.execution.status).toBe('failed');
    expect(res.body.execution.errorMessage).toMatch(/API_TOKEN/);
  });

  test('saving an empty value for a required field is rejected', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user1))
      .send({ values: { API_TOKEN: '' } });
    expect(res.status).toBe(400);
  });

  test('saving credentials succeeds, and secret values/defaults are never echoed back', async () => {
    const saveRes = await request(app)
      .post(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user1))
      .send({ values: { API_TOKEN: 'fixture-secret-value' } });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.saved).toEqual(['API_TOKEN']);

    const listRes = await request(app)
      .get(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user1));
    expect(listRes.status).toBe(200);

    const apiTokenField = listRes.body.credentials.find((f) => f.key === 'API_TOKEN');
    expect(apiTokenField.saved).toBe(true);
    expect(apiTokenField.value).toBeNull();

    // LEGACY_SECRET has a defaultValue but was never saved - it must still
    // never reveal that default through the credentials list endpoint.
    const legacyField = listRes.body.credentials.find((f) => f.key === 'LEGACY_SECRET');
    expect(legacyField.saved).toBe(false);
    expect(legacyField.value).toBeNull();

    // Nor through the /definition endpoint, which strips defaultValue from
    // any secret-type field before it ever reaches the frontend.
    const defRes = await request(app)
      .get(`/api/integrations/${integration.id}/definition`)
      .set('Authorization', authHeader(user1));
    const legacyDef = defRes.body.definition.credentials.find((f) => f.key === 'LEGACY_SECRET');
    expect(legacyDef.defaultValue).toBeUndefined();
  });

  test('manual run now succeeds and creates an execution record with triggerType manual', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test', payload: { hello: 'world' } });

    expect(res.status).toBe(200);
    expect(res.body.execution.status).toBe('success');
    expect(res.body.execution.triggerType).toBe('manual');

    const stored = await prisma.execution.findUnique({ where: { id: res.body.execution.id } });
    expect(stored).not.toBeNull();

    const output = JSON.parse(res.body.execution.outputPayload);
    expect(output.hasApiToken).toBe(true);
    expect(output.greeting).toBe('Hello'); // GREETING's defaultValue applied
  });

  test('dry_run skips the real connector call entirely', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/dry-run`)
      .set('Authorization', authHeader(user1))
      .send({ payload: { callConnector: true } });

    expect(res.body.execution.status).toBe('success');
    const output = JSON.parse(res.body.execution.outputPayload);
    expect(output.connectorResult).toEqual({ success: true, skipped: true, reason: 'dry_run', mocked: false });
  });

  test('mock_output uses the mock connector implementation', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'mock_output', payload: { callConnector: true } });

    expect(res.body.execution.status).toBe('success');
    const output = JSON.parse(res.body.execution.outputPayload);
    expect(output.connectorResult).toEqual({
      success: true,
      mocked: true,
      providerMessageId: 'mock-message-123',
      request: { to: '0000000000', message: 'fixture test message' },
    });
  });

  test('a failed handler marks the execution failed and records the error message', async () => {
    const res = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test', payload: { shouldFail: true } });

    expect(res.body.execution.status).toBe('failed');
    expect(res.body.execution.errorMessage).toMatch(/shouldFail/);
  });

  test('replay copies the original payload into a new, linked execution', async () => {
    const original = await request(app)
      .post(`/api/integrations/${integration.id}/run`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test', payload: { replayMe: true } });
    const sourceId = original.body.execution.id;
    expect(original.body.execution.status).toBe('success');

    const replay = await request(app)
      .post(`/api/executions/${sourceId}/replay`)
      .set('Authorization', authHeader(user1))
      .send({ executionMode: 'test' });

    expect(replay.status).toBe(200);
    expect(replay.body.execution.id).not.toBe(sourceId);
    expect(replay.body.execution.sourceExecutionId).toBe(sourceId);
    expect(JSON.parse(replay.body.execution.inputPayload)).toEqual({ replayMe: true });
  });

  describe('public webhook endpoint', () => {
    test('rejects requests with no valid token', async () => {
      const res = await request(app).post(`/webhooks/${user1.slug}/${integration.slug}`).send({ hello: 'world' });
      expect(res.status).toBe(401);

      const warningLog = await prisma.log.findFirst({
        where: {
          integrationId: integration.id,
          level: 'warning',
          message: { contains: 'Rejected Priority webhook before execution' },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(warningLog).not.toBeNull();
      const metadata = JSON.parse(warningLog.metadata);
      expect(metadata).toMatchObject({
        reason: 'invalid_or_missing_priority_bpm_token',
        providedHeaderName: 'none',
        providedValuePresent: false,
        savedValueConfigured: false,
      });
    });

    test('creates a real, live execution once the token is configured and matches', async () => {
      const settingsRes = await request(app)
        .post(`/api/integrations/${integration.id}/webhook-settings`)
        .set('Authorization', authHeader(user1))
        .send({ token: 'fixture-webhook-token' });
      expect(settingsRes.status).toBe(200);

      const tokenRes = await request(app)
        .get(`/api/integrations/${integration.id}/webhook-token`)
        .set('Authorization', authHeader(user1));
      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.token).toBe('fixture-webhook-token');

      const res = await request(app)
        .post(`/webhooks/${user1.slug}/${integration.slug}`)
        .set('Authorization', 'Bearer fixture-webhook-token')
        .send({ hello: 'from-third-party' });

      expect(res.status).toBe(200);
      expect(res.body.execution.triggerType).toBe('webhook');
      expect(res.body.execution.executionMode).toBe('live');

      const stored = await waitForExecution(res.body.execution.id);
      expect(stored).not.toBeNull();
      expect(stored.status).toBe('success');
    });

    test('accepts a saved Priority-generated token from webhook headers', async () => {
      const settingsRes = await request(app)
        .post(`/api/integrations/${integration.id}/webhook-settings`)
        .set('Authorization', authHeader(user1))
        .send({ token: 'priority-generated-token' });
      expect(settingsRes.status).toBe(200);

      const res = await request(app)
        .post(`/webhooks/${user1.slug}/${integration.slug}`)
        .set('Priority-BPM-Token', 'priority-generated-token')
        .set('Priority-BPM-ID', '10948')
        .set('Priority-BPM-Subject', 'Quote to whatsup')
        .set('Priority-Form-Name', 'CPROF')
        .send({ hello: 'from-priority' });

      expect(res.status).toBe(200);
      expect(res.body.execution.triggerType).toBe('webhook');
      const stored = await waitForExecution(res.body.execution.id);
      expect(stored.status).toBe('success');

      const acceptedLog = await prisma.log.findFirst({
        where: {
          integrationId: integration.id,
          level: 'info',
          message: { contains: 'Accepted Priority webhook request' },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(acceptedLog).not.toBeNull();
      expect(acceptedLog.executionId).toBe(res.body.execution.id);
      const metadata = JSON.parse(acceptedLog.metadata);
      expect(metadata.providedHeaderName).toBe('priority-bpm-token');
      expect(metadata.priorityHeaders).toMatchObject({
        priorityBpmId: '10948',
        priorityBpmSubject: 'Quote to whatsup',
        priorityFormName: 'CPROF',
      });
      expect(JSON.stringify(metadata)).not.toContain('priority-generated-token');
    });
  });
});
