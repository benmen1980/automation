const express = require('express');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { createNotificationService } = require('../core/notification-recipients');

// Deliberately not mounted. Future automation wiring must explicitly allow IDs.
function createNotificationRouter({ enabledIntegrationIds = [], service = createNotificationService() } = {}) {
  const router = express.Router();
  const enabled = new Set(enabledIntegrationIds);
  router.use(requireAuth);
  const available = (req, res, next) => enabled.has(req.integration.id)
    ? next() : res.status(404).json({ error: 'Notifications are not enabled for this integration.' });
  const handle = (operation) => async (req, res, next) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error.statusCode === 400) return res.status(400).json({ error: error.message, invalid: error.invalid });
      next(error);
    }
  };
  router.get('/:id/notifications', loadIntegration(), available,
    handle(async (req) => ({ recipients: await service.refresh(req.integration) })));
  router.put('/:id/notifications', loadIntegration({ mutate: true }), available,
    handle((req) => service.save(req.integration, req.body?.recipients)));
  router.post('/:id/notifications/test', loadIntegration({ mutate: true }), available,
    handle((req) => service.test(req.integration)));
  return router;
}

module.exports = { createNotificationRouter };
