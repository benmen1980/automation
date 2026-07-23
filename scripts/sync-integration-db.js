/**
 * Safely upserts the users and integration records that should exist for the
 * deployed codebase. Unlike prisma/seed.js, this does not write credentials.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function webhookUrlFor(def) {
  if (def.user.slug === 'tuf1' && def.slug === 'priority-quote-whatsapp') {
    return `/tuf1/${def.slug}`;
  }
  return `/webhooks/${def.user.slug}/${def.slug}`;
}

const USERS = [
  { slug: 'admin', email: 'admin@example.com', name: 'Platform Admin', role: 'admin', password: 'Admin123!' },
  { slug: 'user_001', email: 'user1@example.com', name: 'David Cohen', role: 'user', password: 'User123!' },
  { slug: 'user_002', email: 'user2@example.com', name: 'Maya Levi', role: 'user', password: 'User123!' },
];

function integrationDefinitions(usersBySlug) {
  const user1 = usersBySlug.get('user_001');
  const user2 = usersBySlug.get('user_002');
  const tuf1 = usersBySlug.get('tuf1');

  return [
    { user: user1, name: 'WhatsApp Order Notification', description: 'Receives order data and sends a WhatsApp message.', slug: 'whatsapp-order', type: 'webhook', codeFolder: 'src/integrations/user_001/whatsapp-order' },
    { user: user1, name: 'Stock Sync', description: 'Checks stock levels on a schedule and emails a low-stock alert.', slug: 'stock-sync', type: 'scheduled', codeFolder: 'src/integrations/user_001/stock-sync', cron: '0 2 * * *' },
    { user: user2, name: 'WhatsApp Order Notification', description: 'Receives order data and sends a WhatsApp message.', slug: 'whatsapp-order', type: 'webhook', codeFolder: 'src/integrations/user_002/whatsapp-order' },
    { user: user1, name: 'Priority to Shopify Inventory Sync', description: 'Every 10 minutes, read Priority inventory and update/capture Shopify inventory.', slug: 'priority-shopify-inventory', type: 'scheduled', codeFolder: 'src/integrations/user_001/priority-shopify-inventory', cron: '*/10 * * * *' },
    { user: user1, name: 'Priority inventory to email', description: 'Read Priority inventory and email the inventory JSON attachment through Gmail API.', slug: 'priority-inventory-to-email', type: 'scheduled', codeFolder: 'src/integrations/user_001/priority-inventory-to-email', cron: '*/10 * * * *' },
    { user: user1, name: 'Priority inventory to file', description: 'Scheduled task that gets inventory from Priority PARTBAL and writes timestamped JSON locally.', slug: 'priority-inventory-to-file', type: 'scheduled', codeFolder: 'src/integrations/user_001/priority-inventory-to-file', cron: '*/10 * * * *' },
    { user: user1, name: 'Shopify Orders to Priority', description: 'Receive Shopify order webhooks and create Priority orders.', slug: 'shopify-orders-priority', type: 'webhook', codeFolder: 'src/integrations/user_001/shopify-orders-priority' },
    { user: user1, name: 'Priority Balance to WhatsApp', description: 'Receive customer webhook, read Priority data, and send WhatsApp.', slug: 'priority-whatsapp', type: 'webhook', codeFolder: 'src/integrations/user_001/priority-whatsapp' },
    { user: user1, name: 'Priority Quote Notification to WhatsApp', description: 'Receive Priority quote webhooks and send WhatsApp template notifications.', slug: 'priority-quote-whatsapp', type: 'webhook', version: '1.2.4', codeFolder: 'src/integrations/user_001/priority-quote-whatsapp' },
    { user: user1, name: 'Gmail Quote Request to Priority', description: 'Receive Gmail quote request webhook and open a Priority quote.', slug: 'gmail-priority-quote', type: 'webhook', codeFolder: 'src/integrations/user_001/gmail-priority-quote' },
    { user: user1, name: 'User 001 WhatsApp Webhook', description: 'Receives WhatsApp-style webhook payloads and writes each request body to a local JSON file.', slug: 'user-001-whatsapp', type: 'webhook', codeFolder: 'src/integrations/user_001/user-001-whatsapp' },
    ...(tuf1
      ? [
          {
            user: tuf1,
            name: 'שידור וואצפ מהזמנת לקוח',
            description: 'שליחת ווצאפ מהזמנת לקוח: יצירת אישור הזמנה דרך Priority Web SDK ושליחת קישור המסמך למערכת ITC.',
            slug: 'priority-quote-whatsapp',
            type: 'webhook',
            version: '1.5.2',
            codeFolder: 'src/integrations/tuf1/priority-quote-whatsapp',
          },
        ]
      : []),
  ];
}

async function upsertUser(def) {
  const passwordHash = await bcrypt.hash(def.password, 10);
  return prisma.user.upsert({
    where: { email: def.email },
    update: {
      slug: def.slug,
      name: def.name,
      role: def.role,
      status: 'active',
    },
    create: {
      slug: def.slug,
      email: def.email,
      name: def.name,
      role: def.role,
      passwordHash,
      status: 'active',
    },
  });
}

async function upsertIntegration(def) {
  const integration = await prisma.integration.upsert({
    where: { userId_slug: { userId: def.user.id, slug: def.slug } },
    update: {
      name: def.name,
      description: def.description,
      type: def.type,
      codeFolder: def.codeFolder,
      version: def.version || '1.0.0',
      manualRunEnabled: true,
      status: 'active',
    },
    create: {
      userId: def.user.id,
      name: def.name,
      description: def.description,
      slug: def.slug,
      type: def.type,
      version: def.version || '1.0.0',
      status: 'active',
      codeFolder: def.codeFolder,
      manualRunEnabled: true,
    },
  });

  if (def.type === 'webhook') {
    await prisma.webhookSettings.upsert({
      where: { integrationId: integration.id },
      update: {
        webhookUrl: webhookUrlFor(def),
        allowedMethod: 'POST',
        active: true,
      },
      create: {
        integrationId: integration.id,
        webhookUrl: webhookUrlFor(def),
        allowedMethod: 'POST',
        active: true,
      },
    });
  }

  if (def.type === 'scheduled') {
    await prisma.scheduleSettings.upsert({
      where: { integrationId: integration.id },
      update: {
        cronExpression: def.cron || '*/10 * * * *',
        timezone: 'Asia/Jerusalem',
        active: true,
      },
      create: {
        integrationId: integration.id,
        cronExpression: def.cron || '*/10 * * * *',
        timezone: 'Asia/Jerusalem',
        active: true,
      },
    });
  }

  return integration;
}

async function main() {
  console.log('Syncing integration DB records...');

  const users = await Promise.all(USERS.map(upsertUser));
  const existingTuf1 = await prisma.user.findUnique({ where: { slug: 'tuf1' } });
  if (existingTuf1) users.push(existingTuf1);
  else console.warn('Skipped tuf1/priority-quote-whatsapp because the tuf1 user does not exist in this database.');
  const usersBySlug = new Map(users.map((user) => [user.slug, user]));

  const synced = [];
  for (const def of integrationDefinitions(usersBySlug)) {
    const integration = await upsertIntegration(def);
    synced.push(`${def.user.slug}/${integration.slug}`);
  }

  console.log(`Integration DB sync complete. Upserted ${synced.length} integration record(s).`);
  for (const item of synced) console.log(`- ${item}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
