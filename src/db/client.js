/**
 * Single shared Prisma client instance. Import this everywhere instead of
 * instantiating `new PrismaClient()` in multiple files (avoids exhausting
 * DB connections, especially under SQLite's single-writer model).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
