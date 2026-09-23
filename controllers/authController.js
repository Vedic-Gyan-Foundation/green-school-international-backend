const AdminUser = require('../models/AdminUser');

// Must match `name` in config/session.js. express-session's destroy() only drops the row in the
// store; the browser keeps its copy of the cookie until someone names it, so logout has to spell
// it out. If the name changes in one file and not the other, logout stops actually signing
// anyone out and nothing complains.
const SESSION_COOKIE_NAME = 'gsi_admin_sid';

// A browser matches a deletion against name, domain and path only, so path is the part that has
// to agree with the session cookie; the rest mirror it so nothing is left behind on a browser
// that is stricter than the specification.
const SESSION_COOKIE_CLEAR_OPTIONS = { path: '/', httpOnly: true, sameSite: 'lax' };

// One sentence for every kind of failure. "No such user" and "wrong password" as separate
// messages hand an attacker a free list of valid usernames to spend their guesses on.
const GENERIC_LOGIN_ERROR = 'Incorrect username or password.';

// Shown when something on our side broke. Deliberately says nothing about what: the reason goes
// to the pm2 log, where the person who can act on it will look.
const UNEXPECTED_ERROR = 'Something went wrong signing you in. Please try again.';

class AuthController {
  // Where to send someone after they sign in. Anything that is not a path on this site is
  // thrown away: a login form that will redirect to wherever ?next= points is a phishing page
  // with the school's own domain and padlock on it.
  static safeRedirectTarget(value) {
    if (typeof value !== 'string') return null;

    const target = value.trim();

    if (target === '' || target.length > 512) return null;
    if (!target.startsWith('/')) return null;
    // '//evil.example' and '/\evil.example' are both absolute URLs to a browser, despite the
    // leading slash. They are the whole trick behind an open redirect.
    if (target.startsWith('//') || target.startsWith('/\\')) return null;
    if (target.includes('://')) return null;
    // A newline in a Location header lets the response be split into a second, forged one.
    if (/[\u0000-\u001f\u007f]/.test(target)) return null;
    // Bouncing back to the login page after a successful login is a loop, not a destination.
    if (target === '/admin/login' || target.startsWith('/admin/login?')) return null;

    return target;
  }

  // Whole minutes, rounded up, because "try again in 0 minutes" reads as a bug.
  static minutesUntil(lockedUntil) {
    if (!lockedUntil) return null;

    const until = new Date(lockedUntil).getTime();
    if (Number.isNaN(until)) return null;

    const minutes = Math.ceil((until - Date.now()) / 60000);
    return minutes > 0 ? minutes : null;
  }

  // Usernames arrive from the internet and end up in the pm2 log. JSON.stringify escapes the
  // newlines that would otherwise let someone forge log lines around their own attempt, and the
  // cap keeps a megabyte of junk out of the log file.
  static forLog(value) {
    return JSON.stringify(String(value === undefined || value === null ? '' : value).slice(0, 80));
  }

  // Every failed attempt leaves one line in the pm2 log. That is what turns "someone says they
  // can't get in" and "someone is grinding passwords at 3am" into two different, visible things.
  // The password is never part of it, in any form.
  static renderFailure(req, res, username, next, message, reason) {
    console.warn(
      `[auth] login failed (${reason}) user=${AuthController.forLog(username)} ip=${req.ip}`
    );

    // 401 is the honest status for a rejected credential. No WWW-Authenticate header goes with
    // it, so no browser pops its own password box on top of our form.
    return res.status(401).render('loginPage.ejs', {
      error: message,
      next: next || '',
      username: username || ''
    });
  }

  // GET /admin/login
  static renderLogin(req, res) {
    const next = AuthController.safeRedirectTarget(req.query.next);

    // Someone who is already signed in and lands here by way of a bookmark should end up where
    // they were going, not at a form asking them to do what they have already done.
    if (req.session && req.session.userId) {
      return res.redirect(next || '/admin');
    }

    return res.render('loginPage.ejs', {
      error: null,
      next: next || '',
      username: ''
    });
  }

  // POST /admin/login
  static async login(req, res) {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const next = AuthController.safeRedirectTarget(req.body.next);

    try {
      // An empty box is still a failed attempt, and it still gets the dummy verify: skipping the
      // work here would make a blank submission measurably faster than a real one.
      if (!username || !password) {
        await AdminUser.verifyDummy();
        return AuthController.renderFailure(
          req,
          res,
          username,
          next,
          GENERIC_LOGIN_ERROR,
          'missing credentials'
        );
      }

      const user = await AdminUser.findByUsername(username);

      // No such user, or a disabled one. The argon2 verify against a throwaway hash is not
      // theatre: without it this branch answers in a millisecond and a real username's branch
      // takes eighty, which is a reliable way to enumerate who has an account.
      if (!user || user.is_active === false || user.is_active === 0) {
        await AdminUser.verifyDummy();
        return AuthController.renderFailure(
          req,
          res,
          username,
          next,
          GENERIC_LOGIN_ERROR,
          user ? 'inactive account' : 'unknown user'
        );
      }

      const locked = AdminUser.isLocked(user);

      // The password is checked even for a locked account, and the answer is what decides which
      // message goes back. Checking the lock first and returning early — the obvious order — turns
      // the lockout message into a username oracle: an attacker grinding one name would be told
      // "too many failed attempts", which only a REAL account can say, while an invented name
      // keeps getting "incorrect username or password". Eight cheap guesses would then confirm
      // whether a username exists. Verifying first costs the same ~80ms either way and removes it.
      const passwordOk = await AdminUser.verifyPassword(user, password);

      if (locked) {
        // Right password, locked account: this is overwhelmingly the real operator who mistyped
        // their way into the lockout, and leaving them to guess why a password they know is
        // correct keeps failing is worse than useless. They already know the password, so the
        // message tells an attacker nothing an attacker does not already have.
        if (passwordOk) {
          const minutes = AuthController.minutesUntil(user.locked_until);
          const message = minutes
            ? `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
            : 'Too many failed attempts. Please try again shortly.';

          return AuthController.renderFailure(req, res, username, next, message, 'account locked');
        }

        // Wrong password against a locked account: the generic message, and deliberately NO
        // registerFailure. Counting it would push locked_until forward on every attempt, so an
        // attacker who never guesses right could keep a real operator locked out indefinitely.
        // The lock has to be able to expire on its own.
        return AuthController.renderFailure(
          req,
          res,
          username,
          next,
          GENERIC_LOGIN_ERROR,
          'bad password while locked'
        );
      }

      if (!passwordOk) {
        // Keyed by username, not by id: the model writes the counter with a WHERE on the
        // name so that the same call is safe for a login that never found a row.
        await AdminUser.registerFailure(user.username);
        return AuthController.renderFailure(
          req,
          res,
          username,
          next,
          GENERIC_LOGIN_ERROR,
          'bad password'
        );
      }

      // Session fixation: anyone who could plant a session id in this browser before the login
      // would otherwise be holding a cookie that has just become an admin session. A new id is
      // issued here, at the moment privilege is granted, which makes the old one worthless.
      await new Promise((resolve, reject) => {
        req.session.regenerate((error) => (error ? reject(error) : resolve()));
      });

      // Identity only. Never the password, never its hash: session rows live in MySQL and in
      // whatever backs it up, and nothing here is worth having in either place.
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.display_name || user.username;
      req.session.loginAt = new Date().toISOString();

      await AdminUser.registerSuccess(user.id);

      // Written to the store before the redirect goes out. Otherwise the browser's very next
      // request can arrive at /admin before the session row exists, find no session, and bounce
      // straight back to this form - the same symptom as a broken password, from a correct one.
      await new Promise((resolve, reject) => {
        req.session.save((error) => (error ? reject(error) : resolve()));
      });

      console.log(`[auth] signed in user=${AuthController.forLog(user.username)} ip=${req.ip}`);

      return res.redirect(next || '/admin');
    } catch (error) {
      // The reason goes to pm2, not to the browser: a database error message on a login page
      // tells an attacker about the stack behind it.
      console.error('[auth] login error:', error.message);

      return res.status(500).render('loginPage.ejs', {
        error: UNEXPECTED_ERROR,
        next: next || '',
        username
      });
    }
  }

  // POST /admin/logout — POST, not GET, so that an <img src="/admin/logout"> on any page in the
  // world cannot sign an operator out, and so that CSRF protection applies to it at all.
  static logout(req, res) {
    const username = req.session ? req.session.username : null;

    req.session.destroy((error) => {
      if (error) {
        // The cookie still gets cleared below. A stale row in the sessions table expires on its
        // own; a cookie left in the browser is the part that would still look signed in.
        console.error('[auth] failed to destroy session on logout:', error.message);
      }

      res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_CLEAR_OPTIONS);
      console.log(`[auth] signed out user=${AuthController.forLog(username)} ip=${req.ip}`);

      return res.redirect('/admin/login');
    });
  }
}

module.exports = AuthController;
