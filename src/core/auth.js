/**
 * Authentication helpers. AUTH_MODE=mock issues real JWTs against the
 * local DB (bcrypt-hashed passwords) — "mock" here means "no Cognito",
 * not "fake security". Swap to Cognito for production by replacing
 * `login()` with a Cognito token verification step while keeping the
 * same { id, slug, email, role } shape in req.user.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../db/client');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Set it in .env before starting the server.');
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, slug: user.slug, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'active') {
    throw new Error('Invalid email or password.');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password.');
  }
  const token = signToken(user);
  return {
    token,
    user: { id: user.id, slug: user.slug, email: user.email, name: user.name, role: user.role },
  };
}

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 10);
}

module.exports = { signToken, verifyToken, login, hashPassword };
