/**
 * Auth Middleware
 *
 * JWT-based authentication middleware for protecting API routes.
 * Extracts tokens from Authorization header or query parameter.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ikame-vfx-hub-secret';

/**
 * Extract JWT token from the request.
 * Checks Authorization header first, then falls back to ?token= query param.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  // Check Authorization: Bearer <token> header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to ?token= query parameter (used for download links)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
}

/**
 * Authentication middleware (required).
 * Verifies JWT from Authorization header or query param.
 * Rejects the request with 401 if no valid token is present.
 * Sets req.user on success.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      name: decoded.name,
      email: decoded.email,
      picture: decoded.picture,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Optional authentication middleware.
 * Same as authenticate but does not reject if no token is present.
 * Sets req.user to the decoded payload or null.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      name: decoded.name,
      email: decoded.email,
      picture: decoded.picture,
    };
  } catch {
    req.user = null;
  }

  next();
}

module.exports = { authenticate, optionalAuth };
