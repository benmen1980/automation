const mockLocal = { automation_id: 'aut_0000000000000001', version: '1.2.12', connections: { worker_adapter: { package: 'integrations/example' } } };
const mockIntegration = { id: 'integration-1', automationId: mockLocal.automation_id, version: '1.2.11', codeFolder: 'example' };
let mockVersion = '1.2.13';
let mockReadError;

jest.mock('../../src/db/client', () => ({ integration: { findMany: async () => [mockIntegration] } }));
jest.mock('../../src/middleware/auth-middleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1' }; next(); }, requireAdmin: (req, res, next) => next(),
}));
jest.mock('../../src/middleware/load-integration', () => ({ loadIntegration: () => (req, res, next) => { req.integration = mockIntegration; next(); } }));
jest.mock('../../src/core/integration-loader', () => ({ loadDefinition: () => ({ integrationKey: 'example' }) }));
jest.mock('../../src/core/automation-registry', () => ({
  discoverAutomations: () => [mockLocal], findByAutomationId: () => mockLocal, publicManifest: (value) => value,
}));
jest.mock('@aws-sdk/client-s3', () => {
  const digest = (body) => require('crypto').createHash('sha256').update(body).digest('hex');
  return {
    S3Client: jest.fn(() => ({ send: async (command) => {
      if (mockReadError) throw mockReadError;
      const body = JSON.stringify({ ...mockLocal, version: mockVersion });
      const pointer = { manifestKey: `deployed-automations/${mockLocal.automation_id}/releases/build/automation.json`, manifestSha256: digest(body) };
      return { Body: { transformToString: async () => command.input.Key.endsWith('/current.json') ? JSON.stringify(pointer) : body } };
    } })),
    GetObjectCommand: class { constructor(input) { this.input = input; } },
  };
});

const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/integrations', require('../../src/routes/integration-routes'));
app.use((error, req, res, next) => res.status(503).json({ error: error.message }));
const previousBucket = process.env.AUTOMATION_MANIFEST_BUCKET;
beforeEach(() => { process.env.AUTOMATION_MANIFEST_BUCKET = 'test'; mockVersion = '1.2.13'; mockReadError = null; });
afterAll(() => {
  if (previousBucket === undefined) delete process.env.AUTOMATION_MANIFEST_BUCKET;
  else process.env.AUTOMATION_MANIFEST_BUCKET = previousBucket;
});

test('list, detail and manifest return the published version despite older DB and API files', async () => {
  expect((await request(app).get('/api/integrations')).body.integrations[0].version).toBe('1.2.13');
  expect((await request(app).get('/api/integrations/integration-1')).body.integration.version).toBe('1.2.13');
  expect((await request(app).get('/api/integrations/integration-1/manifest')).body.manifest.version).toBe('1.2.13');
});

test('the same running API sees a subsequent publication and ignores stale DB synchronization', async () => {
  await request(app).get('/api/integrations');
  mockVersion = '1.2.14';
  mockIntegration.version = '1.0.0';
  expect((await request(app).get('/api/integrations')).body.integrations[0].version).toBe('1.2.14');
});

test('a read failure does not report the API checkout version as deployed', async () => {
  mockReadError = new Error('S3 unavailable');
  expect((await request(app).get('/api/integrations')).status).toBe(503);
  expect((await request(app).get('/api/integrations/integration-1')).status).toBe(503);
});

test('workers not enabled for independent deployment retain their file version', async () => {
  const previousIds = process.env.AUTOMATION_MANIFEST_AUTOMATION_IDS;
  process.env.AUTOMATION_MANIFEST_AUTOMATION_IDS = 'aut_0000000000000002';
  mockReadError = new Error('must not read S3 for this worker');
  try {
    expect((await request(app).get('/api/integrations')).body.integrations[0].version).toBe('1.2.12');
  } finally {
    if (previousIds === undefined) delete process.env.AUTOMATION_MANIFEST_AUTOMATION_IDS;
    else process.env.AUTOMATION_MANIFEST_AUTOMATION_IDS = previousIds;
  }
});
