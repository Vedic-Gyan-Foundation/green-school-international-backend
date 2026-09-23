const crypto = require('crypto');
const argon2 = require('@node-rs/argon2');
const { promisePool } = require('../config/database');

// OWASP's 2026 argon2id recommendation. Measured on this project's server (and on the dev
// machine) at ~80ms per hash, which is the point: slow enough that offline cracking of a stolen
// password_hash is expensive, fast enough that a real sign-in feels instant.
//
// Changing any of these three numbers changes the hash, so existing rows keep verifying against
// the parameters they were written with (they are encoded in the PHC string itself) — only
// newly written hashes use the new settings.
const ARGON2_OPTIONS = {
  algorithm: argon2.Algorithm.Argon2id,
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 1
};

// How many consecutive bad passwords lock an account, and for how long.
// Kept well above the number of typos a real person makes in one sitting, and well below the
// number of guesses that makes an online attack worthwhile.
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

// Below this, a password is guessable faster than the lockout can stop it.
const MIN_PASSWORD_LENGTH = 12;

// Every row the login flow needs, plus one derived column.
//
// is_locked is computed by MySQL rather than in Node on purpose. locked_until is a TIMESTAMP and
// mysql2 hands it back as a JS Date built from the connection's timezone; comparing that to
// Date.now() quietly depends on the database session timezone and the Node process timezone
// agreeing. Asking the database to compare its own NOW() against its own column removes that
// dependency entirely. locked_until is still selected so the login page can tell the operator
// when they may try again.
const USER_COLUMNS = `
  id, username, password_hash, display_name, is_active,
  last_login_at, failed_attempts, locked_until,
  (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
  created_at, updated_at
`;

class AdminUser {
  // Look an account up by its login name.
  //
  // Returns the row as it is, INCLUDING inactive and locked accounts. It is the caller's job to
  // check is_active and isLocked() — the model hiding those rows would make "no such user" and
  // "account disabled" indistinguishable here, and the login handler needs to tell them apart
  // (while still showing the user the same message for both).
  static async findByUsername(username) {
    const query = `SELECT ${USER_COLUMNS} FROM admin_users WHERE username = ?`;
    const [rows] = await promisePool.query(query, [username]);
    return rows[0] || null;
  }

  // Look an account up by primary key — this is what a request with a session calls, if it
  // needs anything beyond what the session already carries.
  static async findById(id) {
    const query = `SELECT ${USER_COLUMNS} FROM admin_users WHERE id = ?`;
    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Create an account. The plaintext is hashed HERE and goes no further: callers pass a
  // password and never see, store or forward a hash, and nothing outside this method ever holds
  // the plaintext beyond the call. Throws on a password shorter than MIN_PASSWORD_LENGTH so the
  // rule cannot be skipped by calling the model directly.
  static async create({ username, password, displayName }) {
    AdminUser.assertPasswordAcceptable(password);

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    const query = `
      INSERT INTO admin_users (username, password_hash, display_name)
      VALUES (?, ?, ?)
    `;

    const [result] = await promisePool.query(query, [username, passwordHash, displayName || null]);

    return result.insertId;
  }

  // Check a password against a stored hash.
  //
  // Returns false rather than throwing on a malformed or truncated hash: a corrupted row must
  // read as "wrong password", not as a 500 that tells an attacker something about the account.
  static async verifyPassword(user, password) {
    if (!user || !user.password_hash || typeof password !== 'string' || password === '') {
      return false;
    }

    try {
      return await argon2.verify(user.password_hash, password);
    } catch (error) {
      console.error('Admin password verification failed:', error.message);
      return false;
    }
  }

  // Called after a correct password. Clears the failure counter and the lock, so a user who
  // nearly locked themselves out starts clean again.
  static async registerSuccess(id) {
    const query = `
      UPDATE admin_users
      SET last_login_at = NOW(), failed_attempts = 0, locked_until = NULL
      WHERE id = ?
    `;

    await promisePool.query(query, [id]);
  }

  // Called after a wrong password. Increments the counter and, on the attempt that reaches
  // MAX_FAILED_ATTEMPTS, sets the lock.
  //
  // The two assignments are in this order deliberately. MySQL evaluates SET clauses left to
  // right and later clauses see the values written by earlier ones, so locked_until must be
  // decided BEFORE failed_attempts is incremented — otherwise `failed_attempts + 1` in the CASE
  // would already be counting the new value and the lock would fire one attempt early. Written
  // this way the whole decision is one atomic statement, which is what makes it safe against two
  // simultaneous guesses racing each other.
  //
  // Takes a username rather than an id because a failed login may not have found a row at all;
  // an unknown username simply updates nothing.
  static async registerFailure(username) {
    // MAX_FAILED_ATTEMPTS and LOCKOUT_MINUTES are module constants, never request input.
    // LOCKOUT_MINUTES is interpolated because MySQL's INTERVAL takes a literal, not a parameter.
    const query = `
      UPDATE admin_users
      SET locked_until = CASE
            WHEN failed_attempts + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ${LOCKOUT_MINUTES} MINUTE)
            ELSE locked_until
          END,
          failed_attempts = failed_attempts + 1
      WHERE username = ?
    `;

    await promisePool.query(query, [MAX_FAILED_ATTEMPTS, username]);
  }

  // True while an account is inside its lockout window.
  //
  // Prefers the is_locked flag the database computed in findByUsername/findById. The JS fallback
  // is only for a row assembled some other way, and carries the timezone caveat described above.
  static isLocked(user) {
    if (!user) return false;
    if (user.is_locked !== undefined && user.is_locked !== null) {
      return Number(user.is_locked) === 1;
    }
    if (!user.locked_until) return false;
    return new Date(user.locked_until).getTime() > Date.now();
  }

  // How many accounts exist. The app uses this to warn loudly when the table is empty, because
  // an admin panel with no accounts and no nginx basic auth in front of it is unreachable by the
  // operator and wide open to nobody — the failure is confusing rather than dangerous, but it
  // should never be silent.
  static async count() {
    const [rows] = await promisePool.query('SELECT COUNT(*) AS total FROM admin_users');
    return Number(rows[0].total);
  }

  // Replace an account's password.
  //
  // Also clears failed_attempts and locked_until: a reset exists to get someone back in, and
  // leaving the lock in place would mean the new password is rejected for the next 15 minutes
  // with no explanation.
  static async setPassword(id, password) {
    AdminUser.assertPasswordAcceptable(password);

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    const query = `
      UPDATE admin_users
      SET password_hash = ?, failed_attempts = 0, locked_until = NULL
      WHERE id = ?
    `;

    const [result] = await promisePool.query(query, [passwordHash, id]);
    return result.affectedRows;
  }

  // Burn the same CPU a real verification would, for a username that does not exist.
  //
  // Without this, a wrong password against a real account takes ~80ms and a wrong password
  // against an imaginary one returns in under a millisecond — a timing side channel that lets an
  // attacker enumerate valid usernames without ever guessing a password. The login handler must
  // call this on the "user not found" path.
  //
  // Always resolves false. The argument is accepted (and really hashed) only so the work done is
  // indistinguishable from the real path.
  static async verifyDummy(password) {
    try {
      await argon2.verify(AdminUser.DUMMY_HASH, typeof password === 'string' ? password : '');
    } catch (error) {
      // Swallowed on purpose: this call exists for its cost, not its answer.
    }
    return false;
  }

  // Shared by create() and setPassword() so the rule cannot drift between them. The message is
  // written to be shown to a person.
  static assertPasswordAcceptable(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters. ` +
          'Length is what makes an argon2id hash expensive to crack offline; ' +
          'a short password is guessable no matter how slow the hash is.'
      );
    }
  }
}

// A real argon2id hash, of a random throwaway string generated once when this module loads.
//
// Random rather than hardcoded so the same value is never committed, published, or shared
// between deployments — a fixed dummy hash in source would let anyone reading the repo confirm
// by timing which of two responses took the dummy path.
//
// hashSync blocks for ~80ms at require() time, once per process, during startup. That is paid
// deliberately: generating it lazily would make the FIRST unknown-username login fast and every
// later one slow, which is the exact timing leak this constant exists to close.
AdminUser.DUMMY_HASH = argon2.hashSync(crypto.randomBytes(32).toString('hex'), ARGON2_OPTIONS);

AdminUser.MAX_FAILED_ATTEMPTS = MAX_FAILED_ATTEMPTS;
AdminUser.LOCKOUT_MINUTES = LOCKOUT_MINUTES;
AdminUser.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

module.exports = AdminUser;
