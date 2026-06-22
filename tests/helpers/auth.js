/**
 * Mints a real JWT for a test user via the platform's own signToken(), so
 * tests authenticate exactly the way the real login flow does without
 * needing an HTTP round trip through POST /api/auth/login for every test.
 */
const { signToken } = require('../../src/core/auth');

function authHeader(user) {
  return `Bearer ${signToken(user)}`;
}

module.exports = { authHeader };
