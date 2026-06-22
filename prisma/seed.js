/**
 * Seeds the local database with an admin user, two regular users, and the
 * three example integrations that ship in src/integrations/.
 *
 * Run with: npm run db:seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

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
    update: {},
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

async function main() {
  console.log('Seeding database...');

  const admin = await upsertUser({
    slug: 'admin',
    email: 'admin@example.com',
    name: 'Platform Admin',
    role: 'admin',
    password: 'Admin123!',
  });

  const user1 = await upsertUser({
    slug: 'user_001',
    email: 'user1@example.com',
    name: 'David Cohen',
    role: 'user',
    password: 'User123!',
  });

  const user2 = await upsertUser({
    slug: 'user_002',
    email: 'user2@example.com',
    name: 'Maya Levi',
    role: 'user',
    password: 'User123!',
  });

  const whatsappOrder1 = await upsertIntegration(user1, {
    name: 'WhatsApp Order Notification',
    description: 'Receives order data and sends a WhatsApp message.',
    slug: 'whatsapp-order',
    type: 'webhook',
    codeFolder: `src/integrations/${user1.slug}/whatsapp-order`,
  });

  const stockSync = await upsertIntegration(user1, {
    name: 'Stock Sync',
    description: 'Checks stock levels on a schedule and emails a low-stock alert.',
    slug: 'stock-sync',
    type: 'scheduled',
    codeFolder: `src/integrations/${user1.slug}/stock-sync`,
  });

  const whatsappOrder2 = await upsertIntegration(user2, {
    name: 'WhatsApp Order Notification',
    description: 'Receives order data and sends a WhatsApp message.',
    slug: 'whatsapp-order',
    type: 'webhook',
    codeFolder: `src/integrations/${user2.slug}/whatsapp-order`,
  });

  await prisma.webhookSettings.upsert({
    where: { integrationId: whatsappOrder1.id },
    update: {},
    create: {
      integrationId: whatsappOrder1.id,
      webhookUrl: `/webhooks/${user1.slug}/whatsapp-order`,
      allowedMethod: 'POST',
      active: true,
    },
  });

  await prisma.webhookSettings.upsert({
    where: { integrationId: whatsappOrder2.id },
    update: {},
    create: {
      integrationId: whatsappOrder2.id,
      webhookUrl: `/webhooks/${user2.slug}/whatsapp-order`,
      allowedMethod: 'POST',
      active: true,
    },
  });

  await prisma.scheduleSettings.upsert({
    where: { integrationId: stockSync.id },
    update: {},
    create: {
      integrationId: stockSync.id,
      cronExpression: '0 2 * * *',
      timezone: 'Asia/Jerusalem',
      active: true,
    },
  });

  console.log('Seed complete.');
  console.log('Login with:');
  console.log('  admin@example.com / Admin123!  (admin)');
  console.log('  user1@example.com / User123!   (user, owns whatsapp-order + stock-sync)');
  console.log('  user2@example.com / User123!   (user, owns whatsapp-order)');
  console.log('\nWebhook test URLs:');
  console.log(`  POST /webhooks/${user1.slug}/whatsapp-order`);
  console.log(`  POST /webhooks/${user2.slug}/whatsapp-order`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
