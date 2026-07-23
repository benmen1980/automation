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
const workerRoutes = require('./routes/worker-routes');
const { sanitizeString } = require('./utils/sanitize-logs');
const { DOCUMENT_DIRECTORY } = require('./core/priority-document-store');

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
app.use('/api/internal', workerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/integrations', testRoutes); // adds /:id/test, /:id/dry-run, /:id/test-connector
app.use('/api', executionRoutes); // defines /integrations/:id/executions, /integrations/:id/run, /executions/:id[/replay]
app.use('/api', logRoutes); // defines /integrations/:id/logs, /executions/:id/logs
app.use('/webhooks', webhookRoutes); // public, no auth — see core/webhook-runner.js for token validation
app.use('/tuf1', webhookRoutes); // thread-specific short alias endpoint: /tuf1/:integrationSlug

app.use('/documents/priority-orders', (req, res, next) => {
  if (req.path.toLowerCase().endsWith('.pdf')) {
    res.type('application/pdf');
  }
  next();
});

app.use(
  '/documents/priority-orders',
  express.static(DOCUMENT_DIRECTORY, {
    index: false,
    dotfiles: 'deny',
    setHeaders(res, filePath) {
      if (String(filePath || '').toLowerCase().endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; frame-ancestors 'none'"
      );
    },
  })
);

if (fs.existsSync(dashboardIndexPath)) {
  app.use(express.static(dashboardDistPath));

  app.get('*', (req, res, next) => {
    const isApiRequest =
      req.path.startsWith('/api') ||
      req.path.startsWith('/webhooks') ||
      req.path.startsWith('/documents') ||
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
