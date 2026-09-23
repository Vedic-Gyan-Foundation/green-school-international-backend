const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { csrfSync } = require('csrf-sync');

// ---------------------------------------------------------------------------------------------
// MOUNT ORDER — this file assumes app.js wires things in this order, and several of these
// middlewares are wrong or useless out of order:
//
//   1. express.urlencoded / express.json   (so req.body exists for the `_csrf` fallback)
//   2. trustProxyShim                      (config/session.js)
//   3. sessionMiddleware                   (config/session.js — everything below reads req.session)
//   4. attachCsrfToken                     (so every res.render has res.locals.csrfToken)
//   5. csrfProtection                      (before any route that writes)
//   6. requirePublicOrAdmin on /v1, requireAdmin on /admin, /api, /add-form, /add-blog
//
// Also required in app.js:  app.set('trust proxy', 1)
// ---------------------------------------------------------------------------------------------

// The login page's view, named here because the rate limiter has to render it itself when it
// refuses a request. Kept as a constant so the limiter and the login controller cannot drift
// apart. app.js passes the ejs MODULE to `view engine`, not the string 'ejs', so every render in
// this project must spell out the extension.
const LOGIN_VIEW = 'loginPage.ejs';
const LOGIN_PATH = '/admin/login';

// Ten attempts per quarter hour. Enough for someone who genuinely cannot remember which of their
// two passwords this is; nowhere near enough to guess one.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

// The ceiling for the whole front door, counted against the TCP peer instead of a header — see
// loginPeerCeiling below for why a second number is needed at all. Deliberately an order of
// magnitude above the per-IP figure: it is there to bound work, not to be the policy.
const LOGIN_PEER_MAX_ATTEMPTS = 100;

// ---------------------------------------------------------------------------------------------
// PUBLIC_V1 — the complete list of /v1 endpoints the public website reaches with no session.
//
// READ THIS AS A SECURITY DOCUMENT. Everything under /v1 that is not on this list requires a
// signed-in admin. That is the point: a route added to this app next year is protected the day
// it is written, and only becomes public when a human deliberately adds a line here and says in
// the comment which part of the website calls it.
//
// Never convert this to a list of things to BLOCK. A denylist protects what someone remembered;
// an allowlist protects what nobody thought of.
// ---------------------------------------------------------------------------------------------

// Compares a normalised request path against a literal, ignoring case — Express routes
// case-insensitively by default, so the guard has to as well or the two would disagree about
// which handler a request reaches.
const exact = (literal) => {
  const wanted = literal.toLowerCase();
  return (path) => path === wanted;
};

// For the one-parameter read routes. Ids are numeric in every table, so the pattern is kept
// tight rather than using a catch-all segment.
const numericId = (prefix) => {
  const pattern = new RegExp(
    `^${prefix.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d+$`
  );
  return (path) => pattern.test(path);
};

const PUBLIC_V1 = [
  // POST /v1/admission — the admission enquiry form at greenschoolguwahati.com/admission.
  // The most important line in this file. The React site submits it cross-origin, anonymously,
  // with no cookie and no CSRF token. If this ever stops being public, enquiries silently stop
  // arriving and nobody finds out until a parent telephones to ask why they were never called.
  { method: 'POST', test: exact('/v1/admission') },

  // GET /v1/blog/readAll — the Blog listing page on the public site.
  { method: 'GET', test: exact('/v1/blog/readAll') },

  // GET /v1/blog/search — the search box on that same Blog listing page.
  { method: 'GET', test: exact('/v1/blog/search') },

  // GET /v1/blog/readOne/:id — a single blog post page on the public site.
  { method: 'GET', test: numericId('/v1/blog/readOne') },

  // GET /v1/gallery/readAll — the Gallery page on the public site.
  { method: 'GET', test: exact('/v1/gallery/readAll') },

  // GET /v1/gallery/readOne/:id — a single gallery image, opened from the Gallery page.
  { method: 'GET', test: numericId('/v1/gallery/readOne') },

  // GET /v1/video/readAll — the Videos section on the public site.
  { method: 'GET', test: exact('/v1/video/readAll') },

  // GET /v1/video/readOne/:id — a single video.
  { method: 'GET', test: numericId('/v1/video/readOne') },

  // GET /v1/disclosure/readAll — deprecated alias kept for the frontend bundle currently live;
  // the CBSE Public Disclosure page still calls it until that bundle is replaced.
  { method: 'GET', test: exact('/v1/disclosure/readAll') },

  // GET /v1/documents/site — every document the website publishes, grouped by where it appears.
  // Feeds the Public Disclosure tables, the Fee Structure menu and the admission form button.
  { method: 'GET', test: exact('/v1/documents/site') }
];

// Deliberately NOT on that list, and worth saying out loud because it looks like its neighbours:
//   GET /v1/admission — 170 admission records: children's names, parents' names, phone numbers,
//   email addresses and home addresses. Until today it sat behind a separate nginx realm. It is
//   now an ordinary protected route, which is the whole reason this file exists.

// ---------------------------------------------------------------------------------------------
// Path handling
// ---------------------------------------------------------------------------------------------

// Reduce a request URL to the path Express will route on, lowercased for comparison.
//
// Strips the query string and any trailing slash, because Express 4 with its default
// (non-strict) routing treats '/v1/blog/readAll' and '/v1/blog/readAll/' as the same route. It
// does NOT collapse doubled slashes or decode escapes — Express does not either, and anything
// this function fails to recognise falls through to "not on the allowlist", which denies. Every
// ambiguity resolves towards refusing, never towards allowing.
const normalizePath = (originalUrl) => {
  let path = String(originalUrl || '/');

  const queryStart = path.search(/[?#]/);
  if (queryStart !== -1) path = path.slice(0, queryStart);

  if (path.length > 1) path = path.replace(/\/+$/, '');

  return (path || '/').toLowerCase();
};

// The full path of the request as the client asked for it, independent of where a middleware
// happens to be mounted. req.path is relative to the mount point, so a guard mounted with
// app.use('/v1', ...) would otherwise see '/admission' and never match an allowlist written in
// full paths. Reading originalUrl means this file's patterns say exactly what a person typing
// the URL would type.
const requestPath = (req) => normalizePath(req.originalUrl);

// Express routes HEAD to the matching GET handler, so the allowlist has to as well. A HEAD
// returns no body, so treating it as its GET can expose nothing the GET does not.
const requestMethod = (req) => (req.method === 'HEAD' ? 'GET' : req.method);

// GET and POST /admin/login are public by definition — they are how a session begins. This has
// to be checked explicitly rather than inferred from "has no session yet", because a signed-in
// operator can land back on the login page (a bookmark, a second tab, the browser restoring a
// window) and submit it. Inferring it would answer that submission with a CSRF failure instead
// of simply signing them in again.
const isLoginRequest = (req) => {
  const method = requestMethod(req);
  return (method === 'GET' || method === 'POST') && requestPath(req) === LOGIN_PATH;
};

const isPublicV1Request = (req) => {
  const method = requestMethod(req);

  // CORS preflight. cors() answers these before any guard runs, but if one ever reaches here,
  // refusing it would break the cross-origin POST /v1/admission that the preflight precedes.
  // An OPTIONS response carries no data of its own.
  if (method === 'OPTIONS') return true;

  const path = requestPath(req);
  return PUBLIC_V1.some((route) => route.method === method && route.test(path));
};

// ---------------------------------------------------------------------------------------------
// Answering the right way: a page gets a redirect, a fetch() gets JSON
//
// Rendering the login page into a response the admin panel is about to JSON.parse produces
// "Unexpected token '<'" in the console and a button that appears to do nothing. Both halves of
// the panel have to be able to say "you are signed out" in their own language.
// ---------------------------------------------------------------------------------------------
const wantsJson = (req) => {
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('application/json')) return true;
  if (req.headers['x-requested-with']) return true;

  const path = requestPath(req);
  return path === '/v1' || path.startsWith('/v1/') || path === '/api' || path.startsWith('/api/');
};

// Validate a post-login destination before putting it in a Location header.
//
// An unchecked `next` is an open redirect: /admin/login?next=https://evil.example harvests a
// password on a page that looks exactly like the school's, because the victim really did type
// their credentials into the real site first. Only a single-slash local path is accepted —
// '//evil.example' is a protocol-relative URL that browsers treat as absolute, and '/\evil'
// is the same trick with the slash the other way round, which some browsers normalise.
// Control characters are refused because a newline in a Location header splits the response.
const safeNextPath = (value, fallback = '/admin') => {
  const raw = String(value || '');

  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  // Bouncing back to the login page after logging in is a loop, not a destination.
  if (raw.toLowerCase().startsWith(LOGIN_PATH)) return fallback;

  return raw;
};

const isSignedIn = (req) => Boolean(req.session && req.session.userId);

const denyUnauthenticated = (req, res) => {
  if (wantsJson(req)) {
    return res.status(401).json({ success: false, message: 'Not signed in' });
  }

  const next = safeNextPath(req.originalUrl);
  return res.redirect(`${LOGIN_PATH}?next=${encodeURIComponent(next)}`);
};

// ---------------------------------------------------------------------------------------------
// requireAdmin — put this in front of anything only an operator should reach.
//
// It trusts the session rather than re-reading admin_users on every request: the session lives
// server-side in MySQL, it cannot be forged without SESSION_SECRET, and a database round trip
// per page view buys very little. The consequence, which is worth knowing: deactivating an
// account does not sign out a session that is already open. Delete that user's rows from the
// `sessions` table to do that.
// ---------------------------------------------------------------------------------------------
const requireAdmin = (req, res, next) => {
  if (isSignedIn(req)) return next();
  return denyUnauthenticated(req, res);
};

// ---------------------------------------------------------------------------------------------
// requirePublicOrAdmin — the /v1 guard. Mount it at app.use('/v1', requirePublicOrAdmin) BEFORE
// the /v1 routers. Anything not on PUBLIC_V1 needs a session.
// ---------------------------------------------------------------------------------------------
const requirePublicOrAdmin = (req, res, next) => {
  if (isPublicV1Request(req)) return next();
  if (isSignedIn(req)) return next();
  return denyUnauthenticated(req, res);
};

// ---------------------------------------------------------------------------------------------
// CSRF — the Synchroniser Token Pattern, via csrf-sync
//
// The right fit for session cookie auth: a random token is kept in the session (server side) and
// echoed back by the page in a header the browser will not attach on its own. A cross-site form
// can make the browser send the session cookie; it cannot read the token out of our HTML.
// ---------------------------------------------------------------------------------------------
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  // The header the shared admin fetch() wrapper adds, with a fallback to a `_csrf` body field so
  // an ordinary urlencoded <form> can carry one too.
  //
  // MULTIPART CAVEAT: for a multipart/form-data POST the body is parsed by multer, which runs
  // inside the route AFTER this middleware, so req.body is still empty here and the `_csrf`
  // fallback cannot work. The admin panel's two remaining native multipart form submissions
  // (galleryPage.ejs -> POST /api/upload and addGalleryItem.ejs -> POST /v1/gallery/add) must
  // therefore be submitted with fetch() and FormData, which the shared wrapper covers. The
  // alternative — skipping CSRF for multipart requests — is not an option: an attacker chooses
  // their own content type, so that would be a hole rather than an exemption.
  getTokenFromRequest: (req) => {
    const header = req.headers['x-csrf-token'];
    if (typeof header === 'string' && header !== '') return header;
    if (req.body && typeof req.body._csrf === 'string' && req.body._csrf !== '') {
      return req.body._csrf;
    }
    return undefined;
  }
});

// Put the token where EJS can reach it: <meta name="csrf-token" content="<%= csrfToken %>">.
//
// Always defined, even for a signed-out visitor, so a template can render it unconditionally
// without blowing up on undefined. A token is only minted for a request that already has a
// session — generating one for an anonymous visitor would write to req.session and, with
// saveUninitialized false, create a database row for every bot that loads the login page.
const attachCsrfToken = (req, res, next) => {
  res.locals.csrfToken = isSignedIn(req) ? generateToken(req) : '';
  next();
};

// Guard for state-changing requests. GET, HEAD and OPTIONS are exempt by csrf-sync's own
// defaults, as they should be.
const csrfProtection = (req, res, next) => {
  // Never gate a public endpoint. POST /v1/admission arrives from the React site with no session
  // and no token by design, and there is nothing for a CSRF token to protect on a request that
  // carries no credentials in the first place.
  if (isPublicV1Request(req)) return next();

  // Signing in is exempt whether or not a session already exists. Login CSRF is a real but minor
  // attack — it logs a victim into the ATTACKER'S account rather than the other way round — and
  // defending it here would mean minting and storing a session for every anonymous hit on a
  // public login page, which is a far easier thing to abuse than the attack it prevents.
  if (isLoginRequest(req)) return next();

  // No session means no authority to abuse. sameSite 'lax' already keeps the cookie off
  // cross-site POSTs, so a request that reaches here signed out is genuinely anonymous.
  if (!isSignedIn(req)) return next();

  return csrfSynchronisedProtection(req, res, (error) => {
    if (!error) return next();
    if (!error.code || error.code !== 'EBADCSRFTOKEN') return next(error);

    // csrf-sync signals failure by calling next(err), which would land in Express's default
    // error handler and answer a fetch() with an HTML stack page. Answer it properly instead.
    const message =
      'This page is out of date or your session was renewed. Reload the page and try again.';

    if (wantsJson(req)) {
      return res.status(403).json({ success: false, message });
    }

    return res.status(403).type('text/plain').send(message);
  });
};

// ---------------------------------------------------------------------------------------------
// Brute force, the per-request half. Two limiters, both mounted on POST /admin/login, because
// neither key is trustworthy on its own here. The third layer is the per-account lockout in
// models/AdminUser.js, which is keyed on the username and is unaffected by anything below.
//
// WHY TWO
//
// nginx proxies to this app without setting X-Forwarded-For — its proxy_set_header list carries
// only Host, Upgrade and Connection, the same omission that makes config/session.js's
// trustProxyShim necessary. nginx does, however, pass a client's OWN headers through. Combined
// with app.set('trust proxy', 1), that means req.ip is whatever the client says it is: sending a
// fresh `X-Forwarded-For: 203.0.113.<n>` on every attempt gives every attempt its own bucket and
// the per-IP limiter never fires at all. Measured: 14 of 14 forged-header attempts served, versus
// a 429 on the 11th when the header is held constant.
//
// That matters beyond the guessing. Every POST /admin/login costs an ~80ms argon2id hash whether
// or not the username exists (AdminUser.verifyDummy is deliberately as expensive as the real
// path). An unthrottled flood is therefore a CPU exhaustion attack on a single-core box that also
// serves the public website.
//
// So the request-level defence is split:
//
//   loginRateLimiter   keyed on req.ip     — the real policy, 10 per 15 minutes. Spoofable today,
//                                            genuinely per-client the moment nginx sends XFF.
//   loginPeerCeiling   keyed on the SOCKET — cannot be spoofed by any header, because it is the
//                                            TCP peer. Today that is nginx itself, so it is one
//                                            bucket for the whole internet: a hard ceiling on
//                                            work rather than a per-client policy, which is why
//                                            its limit is 100 and not 10.
//
// THE FIX for the spoofing, which is the other half of the same nginx change:
//
//     proxy_set_header X-Forwarded-Proto $scheme;
//     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//
// proxy_set_header REPLACES the client's value and appends the real peer last, and Express with
// 'trust proxy' 1 reads that last entry. Spoofing stops working, loginRateLimiter becomes a true
// per-IP limit with no code change, and loginPeerCeiling recedes into a backstop that legitimate
// traffic never reaches. An address is never synthesised here — inventing a client IP would be
// worse than not having one.
// ---------------------------------------------------------------------------------------------

// Shared by both limiters so a refused request looks the same whichever one refused it.
const renderRateLimited = (req, res) => {
  const minutes = Math.ceil(LOGIN_WINDOW_MS / 60000);
  const message = `Too many sign-in attempts. Please wait ${minutes} minutes and try again.`;

  res.status(429);

  // The library's default is a plain-text or JSON 429, which in a browser window looks like
  // the site broke. Render the real login page with the explanation on it instead.
  //
  // Rendered through the callback form so a missing or broken view cannot throw out of a
  // handler that is already refusing the request — the person still gets told what happened.
  res.render(
    LOGIN_VIEW,
    { error: message, username: '', next: '', csrfToken: res.locals.csrfToken || '' },
    (error, html) => {
      if (error) {
        console.error('Could not render the login page for a rate-limited request:', error.message);
        return res.type('text/plain').send(message);
      }
      return res.send(html);
    }
  );
};

const loginRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_MAX_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: renderRateLimited
});

const loginPeerCeiling = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_PEER_MAX_ATTEMPTS,
  standardHeaders: false,
  legacyHeaders: false,
  // req.socket.remoteAddress, not req.ip: req.ip is derived from X-Forwarded-For and is therefore
  // attacker-controlled until nginx sets that header itself. The socket address is the machine on
  // the other end of the TCP connection and no header can change it. ipKeyGenerator is the
  // library's own normaliser — it collapses an IPv6 address to its /56 so that one attacker with
  // a routed prefix is one bucket rather than 2^72 of them.
  keyGenerator: (req) => ipKeyGenerator(req.socket.remoteAddress || 'unknown'),
  handler: renderRateLimited
});

module.exports = {
  requireAdmin,
  requirePublicOrAdmin,
  loginRateLimiter,
  loginPeerCeiling,
  csrfProtection,
  generateCsrfToken: generateToken,
  attachCsrfToken,
  safeNextPath,
  isPublicV1Request,
  LOGIN_VIEW,
  LOGIN_PATH,
  PUBLIC_V1
};
