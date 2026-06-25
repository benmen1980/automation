const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/db/client');
const credentialsService = require('../../src/core/credentials');
const { createUser, createIntegration } = require('../helpers/factory');
const { authHeader } = require('../helpers/auth');

const CODE_FOLDER = 'src/integrations/user_001/priority-inventory-to-email';

describe('QA agent - credential form save contract', () => {
  let user, integration;

  beforeAll(async () => {
    user = await createUser({ slug: 'credential_qa_user', email: 'credential-qa-user@test.local' });
    integration = await createIntegration({
      user,
      slug: 'priority-inventory-email-qa',
      type: 'scheduled',
      codeFolder: CODE_FOLDER,
      name: 'Priority inventory email QA',
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('saves Google OAuth Client Secret, keeps it masked, and preserves it on later partial saves', async () => {
    const values = {
      PRIORITY_INVENTORY_URL: 'https://priority.example.test/odata/PARTBAL',
      PRIORITY_BASIC_USERNAME: 'API',
      PRIORITY_BASIC_PASSWORD: 'priority-basic-secret',
      GMAIL_USER_EMAIL: 'automation@example.test',
      GMAIL_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
      GMAIL_CLIENT_SECRET: 'google-oauth-client-secret-value',
      GMAIL_REFRESH_TOKEN: 'gmail-refresh-token-value',
      EMAIL_TO_GROUP: 'ops@example.test\nwarehouse@example.test',
      EMAIL_SUBJECT_PREFIX: 'QA inventory',
    };

    const saveRes = await request(app)
      .post(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user))
      .send({ values });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.saved).toEqual(expect.arrayContaining([
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
      'GMAIL_USER_EMAIL',
      'EMAIL_TO_GROUP',
    ]));

    const listRes = await request(app)
      .get(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user));

    expect(listRes.status).toBe(200);
    const byKey = new Map(listRes.body.credentials.map((field) => [field.key, field]));
    expect(byKey.get('GMAIL_CLIENT_SECRET')).toMatchObject({
      key: 'GMAIL_CLIENT_SECRET',
      saved: true,
      isSecret: true,
      value: null,
    });
    expect(byKey.get('GMAIL_CLIENT_ID')).toMatchObject({
      key: 'GMAIL_CLIENT_ID',
      saved: true,
      value: values.GMAIL_CLIENT_ID,
    });

    let loaded = await credentialsService.loadCredentialsForExecution(integration);
    expect(loaded.GMAIL_CLIENT_SECRET).toBe(values.GMAIL_CLIENT_SECRET);

    const partialSaveRes = await request(app)
      .post(`/api/integrations/${integration.id}/credentials`)
      .set('Authorization', authHeader(user))
      .send({ values: { EMAIL_SUBJECT_PREFIX: 'QA inventory updated' } });

    expect(partialSaveRes.status).toBe(200);
    loaded = await credentialsService.loadCredentialsForExecution(integration);
    expect(loaded.GMAIL_CLIENT_SECRET).toBe(values.GMAIL_CLIENT_SECRET);
    expect(loaded.EMAIL_SUBJECT_PREFIX).toBe('QA inventory updated');
  });
});
