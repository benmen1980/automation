require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth-routes');
const adminRoutes = require('./routes/admin-routes');
const integrationRoutes = require('./routes/integration-routes');
const webhookRoutes = require('./routes/webhook-routes');
const executionRoutes = require('./routes/execution-routes');
const logRoutes = require('./routes/log-routes');
const testRoutes = require('./routes/test-routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  // eslint-disable-next-line no-console
  console.log(`${req.method} ${req.originalUrl}`);
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

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error.' });
});

module.exports = app;
