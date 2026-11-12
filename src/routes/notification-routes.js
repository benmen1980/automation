const express = require('express');
const { requireAuth } = require('../middleware/auth-middleware');
const { loadIntegration } = require('../middleware/load-integration');
const { createNotificationService } = require('../core/notification-recipients');

// Common template endpoint: existing integration permissions scope every request.
function createNotificationRouter({ service = createNotificationService() } = {}) {
  const router = express.Router();
  router.use(requireAuth);
  const handle = (operation) => async (req, res, next) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error.statusCode === 400) return res.status(400).json({ error: error.message, invalid: error.invalid });
      next(error);
    }
  };
  router.get('/:id/notifications', loadIntegration(),
    handle(async (req) => ({ recipients: await service.refresh(req.integration) })));
  router.put('/:id/notifications', loadIntegration({ mutate: true }),
    handle((req) => service.save(req.integration, req.body?.recipients)));
  router.post('/:id/notifications/test', loadIntegration({ mutate: true }),
    handle((req) => service.test(req.integration)));
  return router;
}

module.exports = { createNotificationRouter };
