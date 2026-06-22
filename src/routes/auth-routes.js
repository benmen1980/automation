const express = require('express');
const router = express.Router();
const { login } = require('../core/auth');
const { requireAuth } = require('../middleware/auth-middleware');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }
  try {
    const { token, user } = await login(email, password);
    res.json({ token, user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Stateless JWTs: there is no server-side session to invalidate in this
// MVP. The endpoint exists so the frontend has something to call when the
// user clicks "Log out" (and to drop the token client-side).
router.post('/logout', requireAuth, (req, res) => {
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
