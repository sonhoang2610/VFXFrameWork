/**
 * Auth Routes
 *
 * Google OAuth authentication using passport-google-oauth20.
 *
 * Routes:
 *   GET  /auth/google          - Redirect to Google consent screen
 *   GET  /auth/google/callback  - Handle OAuth callback, create JWT, redirect to frontend
 *   GET  /auth/me              - Get current user info from JWT
 *   POST /auth/logout          - Clear session
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ikame-vfx-hub-secret';
const JWT_EXPIRES_IN = '24h';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'ikameglobal.com';

/**
 * GET /auth/google
 * Redirect to Google consent screen.
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

/**
 * GET /auth/google/callback
 * Handle the OAuth callback from Google.
 * Verifies domain, creates JWT, redirects to frontend with token.
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/?error=auth_failed',
  }),
  (req, res) => {
    const user = req.user;

    // Verify email domain
    const emailDomain = user.email.split('@')[1];
    if (ALLOWED_DOMAIN && emailDomain !== ALLOWED_DOMAIN) {
      return res.redirect(
        '/?error=domain_not_allowed&message=' +
          encodeURIComponent(
            `Only @${ALLOWED_DOMAIN} accounts are allowed.`
          )
      );
    }

    // Create JWT with user info
    const payload = {
      name: user.name,
      email: user.email,
      picture: user.picture,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Redirect to frontend with token as query parameter
    res.redirect('/?token=' + encodeURIComponent(token));
  }
);

/**
 * GET /auth/me
 * Return current user info from JWT.
 * Requires valid JWT in Authorization header.
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    name: req.user.name,
    email: req.user.email,
    picture: req.user.picture,
  });
});

/**
 * POST /auth/admin
 * Verify admin password. Returns a short-lived admin JWT.
 */
router.post('/admin', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token });
});

/**
 * POST /auth/logout
 * Clear session. Frontend should also remove the token from localStorage.
 */
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    res.json({ message: 'Logged out successfully' });
  }
});

module.exports = router;
