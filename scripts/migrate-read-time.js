// Converts blogs.read_time from VARCHAR ('5 min') to INT minutes.
//
// read_time used to be free text, so the admin had to type the unit and the value could be
// anything. It is now a plain number of minutes; the API re-attaches ' min' on the way out.
//
// Safe to run more than once — it checks the current column type and exits if already INT.
//
//   node scripts/migrate-read-time.js
require('dotenv').config();

const { promisePool, pool } = require('../config/database');

const migrate = async () => {
  const [cols] = await promisePool.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'blogs' AND COLUMN_NAME = 'read_time'`,
    [process.env.DB_NAME]
  );

  if (!cols.length) {
    throw new Error('blogs.read_time column not found');
  }

  if (cols[0].DATA_TYPE === 'int') {
    console.log('✅ read_time is already INT — nothing to do.');
    return;
  }

  const [before] = await promisePool.query(
    'SELECT id, read_time FROM blogs WHERE read_time IS NOT NULL ORDER BY id'
  );
  console.log(`Found ${before.length} row(s) with a read_time. Current values:`);
  before.forEach((r) => console.log(`  id=${r.id}  "${r.read_time}"`));

  // '5 min' -> '5', '' -> NULL. Anything with no digits becomes NULL rather than 0,
  // so a blog that never had a real value does not gain a bogus "0 min".
  await promisePool.query(
    `UPDATE blogs SET read_time = REGEXP_REPLACE(read_time, '[^0-9]', '') WHERE read_time IS NOT NULL`
  );
  await promisePool.query(`UPDATE blogs SET read_time = NULL WHERE read_time = ''`);
  await promisePool.query(`ALTER TABLE blogs MODIFY read_time INT NULL`);

  const [after] = await promisePool.query(
    'SELECT id, read_time FROM blogs WHERE read_time IS NOT NULL ORDER BY id'
  );
  console.log(`\n✅ Converted. ${after.length} row(s) now hold minutes:`);
  after.forEach((r) => console.log(`  id=${r.id}  ${r.read_time}`));
};

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ read_time migration failed:', error.message);
    pool.end().finally(() => process.exit(1));
  });
