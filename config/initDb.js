const mysql = require('mysql2/promise');
require('dotenv').config();

const initDatabase = async () => {
  let connection;
  
  try {
    // Connect to MySQL server without database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });

    console.log('📦 Initializing database...');

    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    console.log(`✅ Database '${process.env.DB_NAME}' created/verified`);

    // Use the database
    await connection.query(`USE ${process.env.DB_NAME}`);

    // Create blogs table
    const createBlogsTable = `
      CREATE TABLE IF NOT EXISTS blogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        cover_image VARCHAR(500),
        author VARCHAR(100) NOT NULL,
        read_time VARCHAR(50),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_author (author),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createBlogsTable);
    console.log('✅ Table "blogs" created/verified');

    // Create admissions table
    const createAdmissionsTable = `
      CREATE TABLE IF NOT EXISTS admissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        child_name VARCHAR(255) NOT NULL,
        father_name VARCHAR(255) NOT NULL,
        whatsapp_number VARCHAR(15) NOT NULL,
        class VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createAdmissionsTable);
    console.log('✅ Table "admissions" created/verified');

    // Create gallery table
    const createGalleryTable = `
      CREATE TABLE IF NOT EXISTS gallery (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image VARCHAR(500) NOT NULL,
        caption VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createGalleryTable);
    console.log('✅ Table "gallery" created/verified');

    // Insert sample data
    const checkData = await connection.query('SELECT COUNT(*) as count FROM blogs');
    const count = checkData[0][0].count;

    if (count === 0) {
      const sampleBlog = `
        INSERT INTO blogs (title, cover_image, author, read_time, content) VALUES (
          'The Future of Web Development: Trends to Watch in 2025',
          'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=600&fit=crop',
          'John Developer',
          '8 min read',
          '<p>Web development is constantly evolving, and staying ahead of the curve is essential for developers who want to remain competitive.</p><h2>1. AI-Powered Development Tools</h2><p>Artificial Intelligence is revolutionizing how we write code.</p>'
        )
      `;
      await connection.query(sampleBlog);
      console.log('✅ Sample blog inserted');
    }

    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initDatabase;
