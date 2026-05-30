/**
 * Auth Middleware (Placeholder)
 *
 * Currently a pass-through that calls next() without any authentication checks.
 * Google OAuth will be implemented in a later task.
 */

// TODO: Implement Google OAuth authentication
// TODO: Verify JWT token from Authorization header
// TODO: Validate user's email domain against ALLOWED_DOMAIN
// TODO: Attach user info to req.user

/**
 * Authentication middleware placeholder.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  next();
}

module.exports = { authenticate };
