/**
 * Verifies the Bearer JWT on protected routes and attaches req.user.
 * Does NOT apply to /webhooks/* (those use their own token/signature
 * check inside webhook-runner.js, per docs/product/product-architecture-spec.md 5.7).
 */
const { verifyToken } = require('../core/auth');
const prisma = require('../db/client');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }
    req.user = { id: user.id, slug: user.slug, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
