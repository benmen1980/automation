/**
 * Authentication helpers. AUTH_MODE=mock issues real JWTs against the
 * local DB (bcrypt-hashed passwords). In production, Cognito is used only
 * for admin users; regular users continue using the local DB credentials.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../db/client');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const AUTH_MODE = process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'cognito' : 'mock');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Set it in .env before starting the server.');
}

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const cognitoVerifier = AUTH_MODE === 'cognito' && process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
  ? CognitoJwtVerifier.create({ userPoolId: process.env.COGNITO_USER_POOL_ID, clientId: process.env.COGNITO_CLIENT_ID, tokenUse: 'id' })
  : null;

if (AUTH_MODE === 'cognito' && !cognitoVerifier) {
  throw new Error('Cognito authentication requires COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID.');
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
  if (AUTH_MODE === 'cognito' && user.role === 'admin') return loginWithCognito(email, password);

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

async function loginWithCognito(email, password) {
  if (!cognitoVerifier) throw new Error('Cognito authentication is not configured.');
  const result = await cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }));
  if (!result.AuthenticationResult?.IdToken) throw new Error('Cognito requires an additional authentication step.');
  const claims = await cognitoVerifier.verify(result.AuthenticationResult.IdToken);
  const user = await prisma.user.findUnique({ where: { email: claims.email || email } });
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    throw new Error('Cognito login is available only for admins.');
  }
  const adminGroup = process.env.COGNITO_ADMIN_GROUP || 'admins';
  if (!Array.isArray(claims['cognito:groups']) || !claims['cognito:groups'].includes(adminGroup)) {
    throw new Error('Cognito user is not an admin.');
  }
  return { token: result.AuthenticationResult.IdToken, user: { id: user.id, slug: user.slug, email: user.email, name: user.name, role: 'admin' } };
}

async function verifyCognitoToken(token) {
  if (!cognitoVerifier) throw new Error('Cognito authentication is not configured.');
  return cognitoVerifier.verify(token);
}

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 10);
}

module.exports = { signToken, verifyToken, verifyCognitoToken, login, hashPassword };
