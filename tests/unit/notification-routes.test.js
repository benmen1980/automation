jest.mock('../../src/middleware/auth-middleware', () => ({ requireAuth: (req, res, next) =>
  req.headers.authorization ? next() : res.sendStatus(401) }));
jest.mock('../../src/middleware/load-integration', () => ({ loadIntegration: (options = {}) => (req, res, next) => {
  if (req.headers.authorization === 'other-owner') return res.sendStatus(403);
  if (options.mutate && req.headers.authorization === 'viewer') return res.sendStatus(403);
  req.integration = { id: req.params.id, userId: 'owner', name: 'Example' }; next();
} }));
const express = require('express');
const request = require('supertest');
const { createNotificationRouter } = require('../../src/routes/notification-routes');
let service;
beforeEach(() => { service = { refresh: jest.fn(async () => []), save: jest.fn(async () => ({})), test: jest.fn(async () => ({})) }; });
function app(ids = []) {
  const result = express(); result.use(express.json());
  result.use('/integrations', createNotificationRouter({ enabledIntegrationIds: ids, service }));
  return result;
}
test('disabled by default and for every non-selected integration', async () => {
  await request(app()).put('/integrations/a/notifications').set('Authorization', 'editor').send({ recipients: 'a@example.com' }).expect(404);
  await request(app(['a'])).post('/integrations/b/notifications/test').set('Authorization', 'editor').expect(404);
  expect(service.save).not.toHaveBeenCalled(); expect(service.test).not.toHaveBeenCalled();
});
test('routes require authentication and existing view/edit permission middleware', async () => {
  const server = app(['a']);
  await request(server).get('/integrations/a/notifications').expect(401);
  await request(server).get('/integrations/a/notifications').set('Authorization', 'other-owner').expect(403);
  await request(server).get('/integrations/a/notifications').set('Authorization', 'viewer').expect(200);
  await request(server).put('/integrations/a/notifications').set('Authorization', 'viewer').send({ recipients: '' }).expect(403);
  await request(server).post('/integrations/a/notifications/test').set('Authorization', 'viewer').expect(403);
  expect(service.test).not.toHaveBeenCalled(); expect(service.save).not.toHaveBeenCalled();
});
test('save delegates only the current integration and exposes invalid addresses', async () => {
  service.save.mockRejectedValue(Object.assign(new Error('Invalid addresses'), { statusCode: 400, invalid: ['bad'] }));
  const result = await request(app(['a'])).put('/integrations/a/notifications').set('Authorization', 'editor').send({ recipients: 'bad', integrationId: 'b' }).expect(400);
  expect(result.body.invalid).toEqual(['bad']);
  expect(service.save).toHaveBeenCalledWith({ id: 'a', userId: 'owner', name: 'Example' }, 'bad');
});
