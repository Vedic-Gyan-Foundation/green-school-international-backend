// Create or reset an admin panel account.
//
//   node scripts/create-admin-user.js          create an account, or reset an existing one
//   node scripts/create-admin-user.js --list   show who exists, with no secrets
//
// Run it by hand, in an interactive shell on the server. It has to be interactive: the password
// is typed at a hidden prompt and is never accepted as a command-line argument or an environment
// variable. An argument lands in ~/.bash_history and in `ps` output, where every other user on
// the box can read it; an environment variable lands in /proc/<pid>/environ and in pm2's dump
// file. A prompt leaves it in neither.
//
// `ssh vgf 'node scripts/create-admin-user.js'` allocates no TTY and will be refused. Open a
// session first (`ssh vgf`, then cd and run it) or use `ssh -t`.
//
// Nothing here ever prints the password or the resulting hash.

require('dotenv').config();

const readline = require('readline');
const { Writable } = require('stream');

const AdminUser = require('../models/AdminUser');
const { promisePool, pool } = require('../config/database');

// Duplicated from config/initDb.js on purpose, exactly as scripts/seed-disclosure.js duplicates
// its table: initDb only runs from the app's testConnection(), so a database that has never
// booted the app would have no table for this script to write to.
const createAdminUsersTable = `
  CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(150) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const USERNAME_PATTERN = /^[a-z0-9._-]{3,100}$/;

// ---------------------------------------------------------------------------------------------
// Prompting
//
// readline echoes what is typed to its output stream. To hide a password the output stream is
// replaced with one that can be muted: while muted it accepts writes and discards them, so the
// characters never reach the terminal and never reach the scrollback buffer either. The prompt
// itself is written straight to process.stdout, bypassing the muted stream, or it would vanish
// along with the typing.
// ---------------------------------------------------------------------------------------------
const mutableOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!mutableOutput.muted) process.stdout.write(chunk, encoding);
    callback();
  }
});
mutableOutput.muted = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableOutput,
  terminal: true
});

const ask = (question) =>
  new Promise((resolve) => {
    process.stdout.write(question);
    rl.question('', (answer) => resolve(answer.trim()));
  });

const askHidden = (question) =>
  new Promise((resolve) => {
    process.stdout.write(question);
    mutableOutput.muted = true;
    rl.question('', (answer) => {
      mutableOutput.muted = false;
      // readline's own newline was swallowed with everything else that was typed.
      process.stdout.write('\n');
      resolve(answer);
    });
  });

const askYesNo = async (question) => {
  const answer = (await ask(`${question} [y/N] `)).toLowerCase();
  return answer === 'y' || answer === 'yes';
};

// ---------------------------------------------------------------------------------------------

const formatDate = (value) => {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toISOString().replace('T', ' ').slice(0, 19);
};

const listUsers = async () => {
  await promisePool.query(createAdminUsersTable);

  // password_hash is deliberately absent from this SELECT. A hash is not a secret in the way a
  // password is, but it is the thing an offline cracker needs, and there is no reason for it to
  // be on anyone's screen or in a terminal log.
  const [rows] = await promisePool.query(
    `SELECT username, is_active, last_login_at, failed_attempts, locked_until
     FROM admin_users
     ORDER BY username`
  );

  if (rows.length === 0) {
    console.log(
      '\nNo admin accounts exist yet. Run this script with no arguments to create one.\n'
    );
    return;
  }

  console.log(`\n${rows.length} admin account${rows.length === 1 ? '' : 's'}:\n`);

  rows.forEach((row) => {
    const status = row.is_active ? 'active' : 'DISABLED';
    const locked = row.locked_until && new Date(row.locked_until) > new Date() ? '  [locked]' : '';
    console.log(`  ${row.username}`);
    console.log(`      status       ${status}${locked}`);
    console.log(`      last sign-in ${formatDate(row.last_login_at)}`);
    if (row.failed_attempts > 0) {
      console.log(`      failed since ${row.failed_attempts} consecutive failed attempt(s)`);
    }
  });

  console.log('');
};

// Asks twice and returns the password only when both entries match and the length rule passes.
// Loops rather than exiting, so a mistyped confirmation does not mean starting over.
const promptForPassword = async () => {
  for (;;) {
    const password = await askHidden('New password (hidden): ');

    if (password.length < AdminUser.MIN_PASSWORD_LENGTH) {
      console.log(
        `\n  Too short. A password for this account must be at least ` +
          `${AdminUser.MIN_PASSWORD_LENGTH} characters.\n` +
          '  The stored hash is argon2id, which makes each guess cost about 80ms — that only\n' +
          '  buys anything if there are too many guesses to get through. A short password is\n' +
          '  cracked in an afternoon no matter how slow the hash is. Four unrelated words is\n' +
          '  easier to remember and far harder to guess than a mangled single word.\n'
      );
      continue;
    }

    const confirmation = await askHidden('Type it again to confirm: ');

    if (password !== confirmation) {
      console.log('\n  The two entries did not match. Try again.\n');
      continue;
    }

    return password;
  }
};

const run = async () => {
  await promisePool.query(createAdminUsersTable);

  // A useful thing to notice while someone is already thinking about admin access. Only the key
  // name is ever mentioned; the value is not read, printed or logged.
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    console.log(
      "\n  Note: SESSION_SECRET is missing or too short in this directory's .env file.\n" +
        '  The app refuses to start without one of at least 32 characters.\n' +
        '  Generate one with:  openssl rand -hex 32\n'
    );
  }

  console.log('\nGreen School admin account\n');

  const rawUsername = await ask('Username: ');
  const username = rawUsername.toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      'A username must be 3 to 100 characters, using only letters, digits, dot, underscore or hyphen.'
    );
  }

  if (username !== rawUsername) {
    console.log(`  (stored as "${username}" — usernames are not case sensitive)`);
  }

  const existing = await AdminUser.findByUsername(username);

  if (existing) {
    console.log(`\n  "${username}" already exists.`);
    console.log(`  Last sign-in: ${formatDate(existing.last_login_at)}`);

    const reset = await askYesNo("\n  Reset this account's password?");

    if (!reset) {
      console.log('\nNothing was changed.\n');
      return;
    }

    const password = await promptForPassword();
    await AdminUser.setPassword(existing.id, password);

    console.log('\n  Password reset.');
    console.log(`  Username: ${username}`);
    if (existing.failed_attempts > 0 || existing.locked_until) {
      console.log('  Any lockout on the account has been cleared.');
    }
    if (!existing.is_active) {
      console.log('  NOTE: this account is disabled, so the new password will not sign in yet.');
    }
    console.log('\n  The password is not stored anywhere it can be read back. If it is lost,');
    console.log('  run this script again to set a new one.\n');
    return;
  }

  const displayName = await ask('Display name (optional, shown in the panel): ');
  const password = await promptForPassword();

  await AdminUser.create({ username, password, displayName: displayName || null });

  console.log('\n  Account created.');
  console.log(`  Username: ${username}`);
  console.log('  It can sign in at https://api.greenschoolguwahati.com/admin/login');
  console.log('\n  The password is not stored anywhere it can be read back. If it is lost,');
  console.log('  run this script again to set a new one.\n');
};

const main = async () => {
  const wantsList = process.argv.slice(2).includes('--list');

  if (wantsList) {
    await listUsers();
    return;
  }

  // Refuse to pretend the password is hidden when there is no terminal to hide it from. A
  // non-interactive stdin also means the password arrived from a file, a pipe or a heredoc —
  // all of which leave it somewhere on disk or in shell history.
  if (!process.stdin.isTTY) {
    throw new Error(
      'This script needs an interactive terminal, because it prompts for a password without\n' +
        'echoing it. Open a shell on the server and run it there:\n' +
        '  ssh vgf\n' +
        '  cd /home/vedicuser/vedicfoundation/greenschool-backend/green-school-international-backend\n' +
        '  node scripts/create-admin-user.js'
    );
  }

  await run();
};

// pool is the callback-style mysql2 pool, so end() takes a callback and returns nothing —
// calling .then()/.finally() on it would crash the failure path with a TypeError. This bit an
// earlier script in this repo.
main()
  .then(() => {
    rl.close();
    pool.end(() => process.exit(0));
  })
  .catch((error) => {
    rl.close();
    console.error(`\n❌ ${error.message}\n`);
    pool.end(() => process.exit(1));
  });
