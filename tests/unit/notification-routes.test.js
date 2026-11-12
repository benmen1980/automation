jest.mock('../../src/middleware/auth-middleware', () => ({ requireAuth: (req, res, next) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: req.headers.authorization === 'other-owner' ? 'other' : 'owner', role: req.headers.authorization === 'viewer' ? 'viewer' : 'user' };
  next();
} }));
jest.mock('../../src/db/client', () => ({ integration: {
  findUnique: jest.fn(async ({ where }) => ({ id: where.id, userId: 'owner', name: 'Example', assignedUserUid: null })),
} }));
const express = require('express');
const request = require('supertest');
const { createNotificationRouter } = require('../../src/routes/notification-routes');
let service;
beforeEach(() => { service = { refresh: jest.fn(async () => []), save: jest.fn(async () => ({})), test: jest.fn(async () => ({})) }; });
function app() {
  const result = express(); result.use(express.json());
  result.use('/integrations', createNotificationRouter({ service }));
  return result;
}
test('common routes are available to all authorized integrations without an allowlist', async () => {
  const server = app();
  for (const id of ['a', 'b', 'new-automation']) {
    await request(server).get('/integrations/' + id + '/notifications').set('Authorization', 'editor').expect(200);
    await request(server).put('/integrations/' + id + '/notifications').set('Authorization', 'editor').send({ recipients: 'a@example.com' }).expect(200);
    await request(server).post('/integrations/' + id + '/notifications/test').set('Authorization', 'editor').expect(200);
  }
  expect(service.save.mock.calls.map(([integration]) => integration.id)).toEqual(['a', 'b', 'new-automation']);
  expect(service.test.mock.calls.map(([integration]) => integration.id)).toEqual(['a', 'b', 'new-automation']);
});
test('routes require authentication and existing view/edit permission middleware', async () => {
  const server = app();
  await request(server).get('/integrations/a/notifications').expect(401);
  await request(server).get('/integrations/a/notifications').set('Authorization', 'other-owner').expect(403);
  await request(server).get('/integrations/a/notifications').set('Authorization', 'viewer').expect(200);
  await request(server).put('/integrations/a/notifications').set('Authorization', 'viewer').send({ recipients: '' }).expect(403);
  await request(server).post('/integrations/a/notifications/test').set('Authorization', 'viewer').expect(403);
  expect(service.test).not.toHaveBeenCalled(); expect(service.save).not.toHaveBeenCalled();
});
test('save delegates only the current integration and exposes invalid addresses', async () => {
  service.save.mockRejectedValue(Object.assign(new Error('Invalid addresses'), { statusCode: 400, invalid: ['bad'] }));
  const result = await request(app()).put('/integrations/a/notifications').set('Authorization', 'editor').send({ recipients: 'bad', integrationId: 'b' }).expect(400);
  expect(result.body.invalid).toEqual(['bad']);
  expect(service.save).toHaveBeenCalledWith({ id: 'a', userId: 'owner', name: 'Example', assignedUserUid: null }, 'bad');
});
