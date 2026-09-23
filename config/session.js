require('dotenv').config();

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { promisePool } = require('./database');

// Eight hours: one working day. Long enough that the office staff sign in once in the morning,
// short enough that a session left open on a shared machine is not usable tomorrow.
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// How often the store sweeps out rows whose expires has passed.
const EXPIRED_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// Anything shorter is not worth the false confidence. 32 characters of hex is 128 bits.
const MIN_SECRET_LENGTH = 32;

// Hosts that mean "this request really is plain http, and that is fine" — a developer on their
// own machine. Everything else is assumed to have arrived over TLS. Matches the same set
// controllers/documentController.js uses, deliberately: two different answers to "is this
// request secure?" in one process is how a bug nobody can reproduce gets written.
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1|0\.0\.0\.0)(:\d+)?$/i;

// ---------------------------------------------------------------------------------------------
// SESSION_SECRET
//
// Validated here, at module load, so a misconfigured deploy fails immediately and visibly
// instead of booting a server that signs cookies with a value an attacker can guess. There is
// deliberately no fallback value: a hardcoded default secret is not a weaker secret, it is no
// secret at all — anyone with the source can mint a signed session cookie for any account.
// ---------------------------------------------------------------------------------------------
const secret = process.env.SESSION_SECRET;

if (!secret || secret.length < MIN_SECRET_LENGTH) {
  const problem = !secret
    ? 'SESSION_SECRET is not set'
    : `SESSION_SECRET is only ${secret.length} characters`;

  throw new Error(
    `${problem}. The admin panel signs its session cookie with it, so the app will not start ` +
      `without one of at least ${MIN_SECRET_LENGTH} characters.\n` +
      '  Generate one:  openssl rand -hex 32\n' +
      '  Then add it to the .env file in this directory as:  SESSION_SECRET=<the value>\n' +
      'Do not reuse a value from another project, and do not commit it.'
  );
}

// ---------------------------------------------------------------------------------------------
// trustProxyShim
//
// WHY THIS EXISTS
//
// nginx terminates TLS for api.greenschoolguwahati.com and proxies to http://localhost:3000, and
// its proxy_set_header list contains only Host, Upgrade and Connection. It does NOT send
// X-Forwarded-Proto. So for a request the browser made over https, Express sees a plain http
// connection: req.secure is false and req.protocol is 'http'.
//
// That matters because the session cookie is marked Secure. With cookie.secure = true and no
// evidence of https, express-session simply declines to send Set-Cookie. Nothing errors. The
// browser stores no cookie, the next request arrives with no session, and the login handler
// redirects back to the login page — forever, with no message, for every correct password. That
// silent loop is the single most likely way this feature breaks in production, which is why the
// shim runs BEFORE the session middleware rather than being left to configuration.
//
// WHAT IT DOES
//
// If the request carries no X-Forwarded-Proto at all, and its Host is not a local development
// host, it fills the header in as 'https'. A real header always wins: the shim only ever writes
// when the header is absent.
//
// THE PROPER FIX
//
// One line in the nginx server block:
//
//     proxy_set_header X-Forwarded-Proto $scheme;
//
// which needs sudo and therefore cannot be done from an automated session. Once it is in place
// this shim becomes a harmless no-op — nginx sends the header, the shim sees it and leaves it
// alone. It is safe to keep either way, and safer to keep than to remove, because removing it
// re-arms the silent login loop the moment that nginx line is lost in a future edit.
// ---------------------------------------------------------------------------------------------
const trustProxyShim = (req, res, next) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const host = String(req.headers.host || '');

  if (!forwardedProto && !LOOPBACK_HOST.test(host)) {
    req.headers['x-forwarded-proto'] = 'https';
  }

  next();
};

// Sessions live in MySQL, not in memory: pm2 restarts this process for every deploy, and an
// in-memory store would sign everyone out each time (and leak, which is why express-session
// warns against its default store in production).
//
// The EXISTING promisePool from config/database.js is handed in as the second argument rather
// than letting the store open its own pool — one pool, one set of connections, one place the
// credentials are read. Passing a connection also flips the library's endConnectionOnClose
// default to false, so closing the store can never tear down the pool the rest of the app is
// using.
const store = new MySQLStore(
  {
    // The library owns the `sessions` table's schema, so it creates it. config/initDb.js
    // deliberately does not define one.
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: EXPIRED_SWEEP_INTERVAL_MS,
    expiration: SESSION_MAX_AGE_MS
  },
  promisePool
);

// The store swallows a failed table creation: its constructor catches the error and hands it to
// a list of "ready" promises that is empty unless somebody asked. Ask, so a broken sessions
// table is a line in the pm2 log instead of every login mysteriously failing.
store
  .onReady()
  .then(() => {
    console.log('✅ Session store ready (table "sessions")');
  })
  .catch((error) => {
    console.error('❌ Session store failed to initialise:', error.message);
  });

const sessionMiddleware = session({
  // Never the default 'connect.sid'. The default name announces the stack to anyone who looks at
  // a response header, which is free reconnaissance for an attacker choosing what to try next.
  name: 'gsi_admin_sid',
  secret,
  // Don't rewrite a session row that nothing changed — that would be a database write on every
  // single admin page view.
  resave: false,
  // Don't create a row for a visitor who never signs in. Without this, every bot that touches
  // GET /admin/login would leave a session in the table.
  saveUninitialized: false,
  // Push the expiry out on every response, so an admin working continuously is not signed out
  // mid-edit eight hours after they arrived.
  rolling: true,
  store,
  // Tells express-session to read X-Forwarded-Proto when deciding whether the connection is
  // secure enough to send a Secure cookie. Paired with trustProxyShim above, and with
  // app.set('trust proxy', 1) in app.js.
  proxy: true,
  cookie: {
    // No JavaScript on the page can read it, so an XSS bug cannot exfiltrate the session.
    httpOnly: true,
    // 'auto', not a hardcoded true, and the difference is the whole reason this app can be
    // developed at all.
    //
    // express-session reads 'auto' as "mark the cookie Secure when this connection is secure",
    // and with proxy: true below it decides that from X-Forwarded-Proto. Combined with
    // trustProxyShim above the answer is:
    //
    //   Host api.greenschoolguwahati.com, no X-Forwarded-Proto  -> shim writes 'https'
    //                                                           -> Secure cookie. Production.
    //   Host localhost:3000                                     -> shim leaves it alone
    //                                                           -> plain cookie. Development.
    //
    // With a hardcoded `secure: true` the second line does not produce a weaker cookie, it
    // produces NO cookie: express-session declines to send Set-Cookie at all on a connection it
    // believes is plain http. A developer then sees every correct password redirect straight back
    // to the login form with no error — the identical symptom to the production failure this file
    // exists to prevent, and impossible to tell apart from a real bug in the login code.
    //
    // What 'auto' costs, stated plainly: nginx forwards client request headers it does not
    // override, so a client can send `X-Forwarded-Proto: http` itself and be issued a cookie
    // without the Secure flag. That downgrades only the forger's OWN session — they cannot set
    // headers on anybody else's request, and a victim's login regenerates the session from the
    // victim's own headers — so it is not an escalation. It disappears entirely under the nginx
    // one-liner in trustProxyShim's note above, because proxy_set_header REPLACES a client's
    // value rather than passing it through.
    secure: 'auto',
    // 'lax', not 'strict'. The panel gets navigated to from outside — a bookmark, a link in an
    // email, the school's own site — and 'strict' withholds the cookie on that first cross-site
    // navigation. The operator would land on the login page, sign in, and be asked to sign in
    // again, which reads as a random logout rather than as a policy.
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  }
});

module.exports = { sessionMiddleware, trustProxyShim };
