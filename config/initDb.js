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
        read_time INT NULL,
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
        sub_caption TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createGalleryTable);
    console.log('✅ Table "gallery" created/verified');

    // Create videos table
    const createVideosTable = `
      CREATE TABLE IF NOT EXISTS videos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        url VARCHAR(500) NOT NULL,
        title VARCHAR(500) NOT NULL,
        published_at DATE NULL,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_published_at (published_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createVideosTable);
    console.log('✅ Table "videos" created/verified');

    // Create disclosure_documents table
    const createDisclosureDocumentsTable = `
      CREATE TABLE IF NOT EXISTS disclosure_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        section CHAR(1) NOT NULL,
        title VARCHAR(500) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        link_label VARCHAR(100) NOT NULL DEFAULT 'Click to Download',
        link_type ENUM('download','view') NOT NULL DEFAULT 'download',
        is_numbered BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INT NOT NULL DEFAULT 0,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_section_order (section, display_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createDisclosureDocumentsTable);
    console.log('✅ Table "disclosure_documents" created/verified');

    // Create documents table — the library. One row per real document, wherever it is shown.
    const createDocumentsTable = `
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        kind ENUM('file','link') NOT NULL DEFAULT 'file',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createDocumentsTable);
    console.log('✅ Table "documents" created/verified');

    // Create document_placements table — where each document appears on the site, and under
    // what caption. The same document is placed more than once on purpose (the fee structure is
    // in both Public Disclosure section C and the Fee Structure menu), which is what makes
    // replacing its file once update every place it is shown.
    const createDocumentPlacementsTable = `
      CREATE TABLE IF NOT EXISTS document_placements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT NOT NULL,
        location VARCHAR(40) NOT NULL,
        label VARCHAR(500) NOT NULL,
        sublabel VARCHAR(255) NULL,
        icon VARCHAR(40) NULL,
        link_label VARCHAR(100) NULL,
        is_numbered BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INT NOT NULL DEFAULT 0,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        INDEX idx_location_order (location, display_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createDocumentPlacementsTable);
    console.log('✅ Table "document_placements" created/verified');

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
