const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const { createLogger } = require('../../src/core/logger');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

const CODE_FOLDER = 'src/integrations/test_fixtures/echo';

describe('Phase 5 observability and UI composition', () => {
  let user;
  let integration;

  beforeAll(async () => {
    user = await createUser({ slug: 'phase5_observability_user', email: 'phase5-observability@test.local' });
    integration = await createIntegration({ user, slug: 'phase5-observability', codeFolder: CODE_FOLDER });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('persists typed event fields and a correlation ID without changing generic log fields', async () => {
    const correlationId = 'phase5-correlation-id';
    const logger = createLogger({
      userId: user.id,
      integrationId: integration.id,
      automationId: integration.automationId,
      executionMode: 'test',
      isTest: true,
      correlationId,
    });
    await logger.info('Phase 5 safe event', { recordsRead: 1 }, {
      eventType: 'automation.execution.completed',
      durationMs: 25,
      attempt: 1,
      statusCode: 200,
    });

    const row = await prisma.log.findFirst({ where: { integrationId: integration.id }, orderBy: { createdAt: 'desc' } });
    expect(row).toMatchObject({
      integrationId: integration.id,
      automationId: integration.automationId,
      eventType: 'automation.execution.completed',
      schemaVersion: 1,
      correlationId,
      durationMs: 25,
      attempt: 1,
      statusCode: 200,
      message: 'Phase 5 safe event',
    });
  });

  test('returns manifest-driven UI metadata and supports typed log filtering', async () => {
    const manifestResponse = await request(app)
      .get(`/api/integrations/${integration.id}/manifest`)
      .set('Authorization', authHeader(user));
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.manifest.ui).toMatchObject({ fallback: true, mode: 'generic' });
    expect(manifestResponse.body.manifest.observability).toMatchObject({ eventSchema: 'automation.log' });

    const logsResponse = await request(app)
      .get(`/api/integrations/${integration.id}/logs`)
      .query({ eventType: 'automation.execution.completed', correlationId: 'phase5-correlation-id' })
      .set('Authorization', authHeader(user));
    expect(logsResponse.status).toBe(200);
    expect(logsResponse.body.logs).toHaveLength(1);
    expect(logsResponse.body.logs[0].correlationId).toBe('phase5-correlation-id');
  });
});
