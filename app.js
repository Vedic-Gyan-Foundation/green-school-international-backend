// Load .env before anything reads process.env. config/database.js also calls this, but app.js
// now needs SESSION_SECRET before that module is ever required, so the load happens here too
// (dotenv is idempotent and never overwrites a value already in the environment).
require('dotenv').config();

const express = require('express');
const path = require('path');
const ejs = require('ejs');
const cors = require('cors');
const bodyParser = require('body-parser');

// SESSION_SECRET is checked BEFORE ./config/session is required, so a misconfigured server gets
// this explanation instead of whatever error the session store happens to throw first.
const MIN_SESSION_SECRET_LENGTH = 32;

// This process used to start happily with a broken configuration and only fall over later,
// inside a request. Sessions are now the only thing standing between the internet and the
// admission records, and a weak or missing secret means forged session cookies, so this has to
// stop the process at boot where pm2 logs it — not degrade into "logins mysteriously never
// stick". The value itself is never printed: this file's neighbour already has a history of
// leaking a secret into the pm2 log.
function assertSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.trim().length < MIN_SESSION_SECRET_LENGTH) {
    console.error(
      [
        '',
        'FATAL: SESSION_SECRET is missing or shorter than ' +
          MIN_SESSION_SECRET_LENGTH +
          ' characters.',
        '',
        'The admin panel signs its session cookies with it. Without a strong, private value',
        'anyone can forge a signed-in session, so the server refuses to start.',
        '',
        'Add it to .env on this machine (never commit the value):',
        '',
        '    SESSION_SECRET=$(openssl rand -hex 32)',
        '',
        'Changing it later is safe: it only signs out everyone who is currently signed in.',
        ''
      ].join('\n')
    );
    process.exit(1);
  }
}

assertSessionSecret();

const { sessionMiddleware, trustProxyShim } = require('./config/session');
const {
  requireAdmin,
  requirePublicOrAdmin,
  csrfProtection,
  attachCsrfToken
} = require('./middleware/auth');

const routes = require('./routes/route');
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const videoRoutes = require('./routes/videoRoutes');
const disclosureRoutes = require('./routes/disclosureRoutes');
const documentRoutes = require('./routes/documentRoutes');
const { testConnection } = require('./config/database');

const app = express();
const port = 3000;

// ---------------------------------------------------------------------------------------------
// 1. Proxy awareness — must run before the session middleware
//
// nginx terminates TLS and proxies to http://localhost:3000. trustProxyShim supplies the
// X-Forwarded-Proto header nginx does not send, and 'trust proxy' is what makes express-session
// believe it. Both have to be in place before a cookie is ever evaluated, because a session
// cookie marked Secure is simply dropped on a connection express thinks is plain http — which
// looks exactly like a login page that loops forever with no error.
// ---------------------------------------------------------------------------------------------
app.set('trust proxy', 1);
app.use(trustProxyShim);

// ---------------------------------------------------------------------------------------------
// 2. Parsers, static files and views
//
// express.static stays above every guard: the school's PDFs, photos and the admin panel's own
// CSS and JS are public files, and putting the login check above them would break the public
// website and the login page's own styling at the same time.
// ---------------------------------------------------------------------------------------------
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', __dirname + '/view');
app.set('view engine', ejs);

// ---------------------------------------------------------------------------------------------
// 3. Sessions, 4. CSRF token for the views
// ---------------------------------------------------------------------------------------------
app.use(sessionMiddleware);
app.use(attachCsrfToken);

// ---------------------------------------------------------------------------------------------
// 4b. Who is signed in, for the views
//
// view/partials/adminBar.ejs prints "Signed in as ..." from res.locals.currentUser, and the
// thirteen admin panels all include that bar. Nothing else in the app sets it, so without this
// middleware every panel renders the bar with the name silently missing — which reads to an
// operator as "am I actually signed in?" rather than as a bug, and is therefore the kind of thing
// that never gets reported.
//
// Copied out of the session rather than re-read from admin_users on every page view: the session
// already carries the only three fields the bar asks for, and a database round trip per request
// would buy nothing. There is nothing sensitive to leak into a template here — the session holds
// { userId, username, displayName, loginAt } and never the password or its hash.
//
// Set for signed-out requests too, as null, so a template that reads it outside the admin panel
// gets a definite answer instead of undefined.
// ---------------------------------------------------------------------------------------------
app.use((req, res, next) => {
  const session = req.session;

  res.locals.currentUser =
    session && session.userId
      ? {
          id: session.userId,
          username: session.username,
          displayName: session.displayName
        }
      : null;

  next();
});

// ---------------------------------------------------------------------------------------------
// 5. Login and logout
//
// Mounted above every guard because a signed-out operator has to be able to reach the login
// page. authRoutes owns /admin/login outright, which is also why no guard below ever sees it.
// ---------------------------------------------------------------------------------------------
app.use('/', authRoutes);

// ---------------------------------------------------------------------------------------------
// 6. CSRF for everything below
//
// One line, because every exemption this needs already exists in middleware/auth.js and belongs
// there: csrfProtection skips the GET-shaped methods, skips anything on PUBLIC_V1 — which is the
// same list requirePublicOrAdmin enforces, so the two can never drift apart and start disagreeing
// about whether POST /v1/admission is public — and skips requests with no session, which have no
// authority for a forged request to borrow. Restating any of that here would create a second copy
// of a security list that nobody would remember to update.
// ---------------------------------------------------------------------------------------------
app.use(csrfProtection);

// ---------------------------------------------------------------------------------------------
// 7. Legacy upload API — /api/upload and /api/get-images, both admin-only.
//
// The mount path is '/api', which matches /api and /api/... and NOT /apiv1, so the public
// health check further down stays public.
// ---------------------------------------------------------------------------------------------
app.use('/api', requireAdmin, routes);

// ---------------------------------------------------------------------------------------------
// 8. Server-rendered admin pages — pages.js applies requireAdmin per route.
// ---------------------------------------------------------------------------------------------
app.use('/', pageRoutes);

// ---------------------------------------------------------------------------------------------
// 9. The /v1 API
//
// One guard, mounted once, ahead of all six routers rather than repeated on each mount: a
// router added to this list later is then covered whether or not whoever adds it remembers to.
// requirePublicOrAdmin holds the allowlist of endpoints the public website calls anonymously
// and requires a session for everything else, so the routers themselves are untouched.
// ---------------------------------------------------------------------------------------------
app.use('/v1', requirePublicOrAdmin);
app.use('/v1', blogRoutes);
app.use('/v1', admissionRoutes);
app.use('/v1', galleryRoutes);
app.use('/v1', videoRoutes);
app.use('/v1', disclosureRoutes);
app.use('/v1', documentRoutes);

app.get('/apiv1', (req, res) => {
  res.json({
    message: 'Hello from the API!'
  });
});

testConnection();

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
