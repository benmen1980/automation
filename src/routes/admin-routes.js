const express = require('express');
const router = express.Router();
const prisma = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth-middleware');
const { hashPassword } = require('../core/auth');
const { slugify } = require('../utils/slugify');

router.use(requireAuth, requireAdmin);

const PUBLIC_USER_FIELDS = { id: true, slug: true, email: true, name: true, role: true, status: true, createdAt: true };

router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: PUBLIC_USER_FIELDS });
  res.json({ users });
});

async function nextUserSlug() {
  const count = await prisma.user.count();
  let candidate = `user_${String(count + 1).padStart(3, '0')}`;
  // Handle gaps/races by falling back to a random suffix if taken.
  while (await prisma.user.findUnique({ where: { slug: candidate } })) {
    candidate = `user_${Math.random().toString(36).slice(2, 8)}`;
  }
  return candidate;
}

router.post('/users', async (req, res) => {
  const { email, name, role = 'user', password, slug } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name, and password are required.' });
  }
  if (!['admin', 'user', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, user, or viewer.' });
  }

  const finalSlug = slug ? slugify(slug) : await nextUserSlug();
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({ data: { email, name, role, passwordHash, slug: finalSlug } });
    res.status(201).json({ user: { id: user.id, slug: user.slug, email: user.email, name: user.name, role: user.role, status: user.status } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email or slug already in use.' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: PUBLIC_USER_FIELDS });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

router.patch('/users/:id', async (req, res) => {
  const { name, role, status, password } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (status !== undefined) data.status = status;
  if (password) data.passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: { id: user.id, slug: user.slug, email: user.email, name: user.name, role: user.role, status: user.status } });
  } catch (err) {
    res.status(404).json({ error: 'User not found.' });
  }
});

module.exports = router;
