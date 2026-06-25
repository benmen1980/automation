/**
 * Seeds the local database with users and runnable template integrations.
 * Run with: npm run db:seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const credentialsService = require('../src/core/credentials');

const prisma = new PrismaClient();

async function upsertUser({ slug, email, name, role, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { slug, email, name, role, passwordHash, status: 'active' },
  });
}

async function upsertIntegration(user, def) {
  return prisma.integration.upsert({
    where: { userId_slug: { userId: user.id, slug: def.slug } },
    update: {
      name: def.name,
      description: def.description,
      type: def.type,
      codeFolder: def.codeFolder,
      manualRunEnabled: true,
    },
    create: {
      userId: user.id,
      name: def.name,
      description: def.description,
      slug: def.slug,
      type: def.type,
      status: 'active',
      codeFolder: def.codeFolder,
      manualRunEnabled: true,
    },
  });
}

async function ensureWebhook(integration, user, token = 'local-webhook-token') {
  await prisma.webhookSettings.upsert({
    where: { integrationId: integration.id },
    update: { webhookUrl: `/webhooks/${user.slug}/${integration.slug}`, allowedMethod: 'POST', active: true },
    create: { integrationId: integration.id, webhookUrl: `/webhooks/${user.slug}/${integration.slug}`, allowedMethod: 'POST', active: true },
  });
  await credentialsService.saveCredentials(integration, {}); // loads definition once and validates paths early
  const webhookRunner = require('../src/core/webhook-runner');
  const secretTokenReference = await webhookRunner.setWebhookToken(integration, token);
  await prisma.webhookSettings.update({ where: { integrationId: integration.id }, data: { secretTokenReference } });
}

async function ensureSchedule(integration, cronExpression = '*/10 * * * *') {
  await prisma.scheduleSettings.upsert({
    where: { integrationId: integration.id },
    update: { cronExpression, timezone: 'Asia/Jerusalem', active: true },
    create: { integrationId: integration.id, cronExpression, timezone: 'Asia/Jerusalem', active: true },
  });
}

async function saveDummyCredentials(integration) {
  await credentialsService.saveCredentials(integration, {
    API_BASE_URL: 'https://dummy.local/api',
    API_KEY: 'dummy-api-key-123',
    LOW_STOCK_THRESHOLD: 5,
    EMAIL_API_URL: 'https://dummy.local/email',
    EMAIL_API_KEY: 'dummy-email-key-123',
    ALERT_RECIPIENT: 'ops@example.com',
    WHATSAPP_TOKEN: 'dummy-whatsapp-token-123',
    WHATSAPP_API_URL: 'https://dummy.local/whatsapp',
    DEFAULT_COUNTRY_CODE: '972',
    PRIORITY_API_URL: 'https://dummy.local/priority',
    PRIORITY_API_KEY: 'dummy-priority-key-123',
    PRIORITY_INVENTORY_URL: 'https://dummy.local/priority/odata/PARTBAL',
    PRIORITY_BASIC_USERNAME: 'API',
    PRIORITY_BASIC_PASSWORD: 'dummy-priority-basic-password-123',
    SHOPIFY_API_URL: 'https://dummy-shop.myshopify.com/admin/api/2024-10',
    SHOPIFY_ACCESS_TOKEN: 'dummy-shopify-token-123',
    LOCAL_OUTPUT_DIR: 'local-data/users/user_001/priority-inventory-to-file',
    GMAIL_USE_LOCAL_FILES: true,
    EMAIL_PROVIDER: 'ses',
    SES_FROM_EMAIL: 'automation@example.com',
    SES_REGION: 'eu-west-1',
    GMAIL_USER_EMAIL: 'automation@example.com',
    GMAIL_CLIENT_ID: 'dummy-google-oauth-client-id.apps.googleusercontent.com',
    GMAIL_CLIENT_SECRET: 'dummy-google-oauth-client-secret-123',
    GMAIL_REFRESH_TOKEN: 'dummy-google-refresh-token-123',
    EMAIL_TO_GROUP: 'ops@example.com\nwarehouse@example.com',
    EMAIL_SUBJECT_PREFIX: 'Priority inventory',
  });
}

async function main() {
  console.log('Seeding database...');

  const admin = await upsertUser({ slug: 'admin', email: 'admin@example.com', name: 'Platform Admin', role: 'admin', password: 'Admin123!' });
  const user1 = await upsertUser({ slug: 'user_001', email: 'user1@example.com', name: 'David Cohen', role: 'user', password: 'User123!' });
  const user2 = await upsertUser({ slug: 'user_002', email: 'user2@example.com', name: 'Maya Levi', role: 'user', password: 'User123!' });

  const definitions = [
    { user: user1, name: 'WhatsApp Order Notification', description: 'Receives order data and sends a WhatsApp message.', slug: 'whatsapp-order', type: 'webhook', codeFolder: `src/integrations/${user1.slug}/whatsapp-order` },
    { user: user1, name: 'Stock Sync', description: 'Checks stock levels on a schedule and emails a low-stock alert.', slug: 'stock-sync', type: 'scheduled', codeFolder: `src/integrations/${user1.slug}/stock-sync`, cron: '0 2 * * *' },
    { user: user2, name: 'WhatsApp Order Notification', description: 'Receives order data and sends a WhatsApp message.', slug: 'whatsapp-order', type: 'webhook', codeFolder: `src/integrations/${user2.slug}/whatsapp-order` },
    { user: user1, name: 'Priority to Shopify Inventory Sync', description: 'Every 10 minutes, read Priority inventory and update/capture Shopify inventory.', slug: 'priority-shopify-inventory', type: 'scheduled', codeFolder: `src/integrations/${user1.slug}/priority-shopify-inventory`, cron: '*/10 * * * *' },
    { user: user1, name: 'Priority inventory to email', description: 'Read Priority inventory and email the inventory JSON attachment through Gmail API.', slug: 'priority-inventory-to-email', type: 'scheduled', codeFolder: `src/integrations/${user1.slug}/priority-inventory-to-email`, cron: '*/10 * * * *' },
    { user: user1, name: 'Priority inventory to file', description: 'Scheduled task that gets inventory from Priority PARTBAL and writes timestamped JSON locally.', slug: 'priority-inventory-to-file', type: 'scheduled', codeFolder: `src/integrations/${user1.slug}/priority-inventory-to-file`, cron: '*/10 * * * *' },
    { user: user1, name: 'Shopify Orders to Priority', description: 'Receive Shopify order webhooks and create Priority orders.', slug: 'shopify-orders-priority', type: 'webhook', codeFolder: `src/integrations/${user1.slug}/shopify-orders-priority` },
    { user: user1, name: 'Priority Balance to WhatsApp', description: 'Receive customer webhook, read Priority data, and send WhatsApp.', slug: 'priority-whatsapp', type: 'webhook', codeFolder: `src/integrations/${user1.slug}/priority-whatsapp` },
    { user: user1, name: 'Gmail Quote Request to Priority', description: 'Receive Gmail quote request webhook and open a Priority quote.', slug: 'gmail-priority-quote', type: 'webhook', codeFolder: `src/integrations/${user1.slug}/gmail-priority-quote` },
  ];

  for (const def of definitions) {
    const integration = await upsertIntegration(def.user, def);
    await saveDummyCredentials(integration);
    if (def.type === 'webhook') await ensureWebhook(integration, def.user);
    if (def.type === 'scheduled') await ensureSchedule(integration, def.cron);
  }

  console.log('Seed complete.');
  console.log('Login with:');
  console.log('  admin@example.com / Admin123!');
  console.log('  user1@example.com / User123!');
  console.log('Webhook token for seeded templates: local-webhook-token');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
