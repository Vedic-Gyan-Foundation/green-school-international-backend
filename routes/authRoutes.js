const express = require('express');
const authRouter = express.Router();
const AuthController = require('../controllers/authController');
const {
  requireAdmin,
  loginRateLimiter,
  loginPeerCeiling,
  csrfProtection
} = require('../middleware/auth');

// Both routes below are plain HTML form posts on purpose: the login page has to work before any
// admin JavaScript has loaded, and signing out has to work on a page whose scripts have failed.
// That is safe because middleware/auth.js configures csrf-sync's getTokenFromRequest to accept
// the token from a `_csrf` form field as well as from the x-csrf-token header, and because
// express.urlencoded has already populated req.body by the time these run.

// Public: someone who cannot sign in has to be able to reach the page that lets them.
authRouter.get('/admin/login', AuthController.renderLogin);

// Both limiters run before anything else, so a flood of guesses is turned away before it costs a
// database lookup and an 80ms password hash each. loginPeerCeiling is first because it is the one
// an attacker cannot escape: its key is the TCP peer, while loginRateLimiter's key comes from
// X-Forwarded-For and is client-controlled until nginx starts setting that header. See the long
// note above both of them in middleware/auth.js.
authRouter.post(
  '/admin/login',
  loginPeerCeiling,
  loginRateLimiter,
  csrfProtection,
  AuthController.login
);

// requireAdmin before csrfProtection: signing out a session that does not exist is a no-op, and
// answering that with "sign in first" is clearer than "invalid token".
authRouter.post('/admin/logout', requireAdmin, csrfProtection, AuthController.logout);

module.exports = authRouter;
