/**
 * Auth Routes (Placeholder)
 *
 * Empty router with TODO comments for Google OAuth implementation.
 */

const express = require('express');
const router = express.Router();

// TODO: POST /api/auth/google - Exchange Google OAuth code for JWT
//   1. Receive { code } from client
//   2. Exchange code for Google tokens via googleapis
//   3. Verify the user's email domain matches ALLOWED_DOMAIN
//   4. Sign a JWT with user info and return it

// TODO: GET /api/auth/me - Return current user info from JWT
//   1. Verify JWT from Authorization header
//   2. Return { email, name, picture }

// TODO: POST /api/auth/logout - Invalidate token (if using a blocklist)

module.exports = router;
