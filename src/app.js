require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth-routes');
const adminRoutes = require('./routes/admin-routes');
const integrationRoutes = require('./routes/integration-routes');
const webhookRoutes = require('./routes/webhook-routes');
const executionRoutes = require('./routes/execution-routes');
const logRoutes = require('./routes/log-routes');
const testRoutes = require('./routes/test-routes');
const { sanitizeString } = require('./utils/sanitize-logs');

const app = express();
const dashboardDistPath = path.resolve(__dirname, '..', 'frontend', 'dashboard', 'dist');
const dashboardIndexPath = path.join(dashboardDistPath, 'index.html');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  // eslint-disable-next-line no-console
  console.log(`${req.method} ${sanitizeString(req.originalUrl)}`);
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/integrations', testRoutes); // adds /:id/test, /:id/dry-run, /:id/test-connector
app.use('/api', executionRoutes); // defines /integrations/:id/executions, /integrations/:id/run, /executions/:id[/replay]
app.use('/api', logRoutes); // defines /integrations/:id/logs, /executions/:id/logs
app.use('/webhooks', webhookRoutes); // public, no auth — see core/webhook-runner.js for token validation

if (fs.existsSync(dashboardIndexPath)) {
  app.use(express.static(dashboardDistPath));

  app.get('*', (req, res, next) => {
    const isApiRequest =
      req.path.startsWith('/api') ||
      req.path.startsWith('/webhooks') ||
      req.path === '/health';

    if (isApiRequest || !req.accepts('html')) return next();
    return res.sendFile(dashboardIndexPath);
  });
} else if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn(`Dashboard build not found at ${dashboardDistPath}. Frontend routes will return 404.`);
}

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error.' });
});

module.exports = app;
