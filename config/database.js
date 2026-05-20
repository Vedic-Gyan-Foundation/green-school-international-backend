const mysql = require('mysql2');
const initDatabase = require('./initDb');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Get promise-based connection
const promisePool = pool.promise();

// Test connection
const testConnection = async () => {
  try {
    console.log(process.env.DB_PASSWORD)
    const connection = await promisePool.getConnection();
    console.log('✅ Database connected successfully');
    initDatabase(); // Initialize database and tables
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = { pool, promisePool, testConnection };
