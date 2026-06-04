const { promisePool } = require('../config/database');

class Blog {
  // Create a new blog
  static async create(blogData) {
    const { title, cover_image, author, read_time, content } = blogData;
    
    const query = `
      INSERT INTO blogs (title, cover_image, author, read_time, content)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await promisePool.query(query, [
      title,
      cover_image,
      author,
      read_time,
      content
    ]);
    
    return result.insertId;
  }

  // Get all blogs with pagination
  static async getAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id, title, cover_image, author, read_time, 
             SUBSTRING(content, 1, 200) as excerpt,
             created_at, updated_at
      FROM blogs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const [rows] = await promisePool.query(query, [parseInt(limit), parseInt(offset)]);
    
    // Get total count
    const [countResult] = await promisePool.query('SELECT COUNT(*) as total FROM blogs');
    const total = countResult[0].total;
    
    return {
      blogs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get blog by ID
  static async getById(id) {
    const query = `
      SELECT * FROM blogs WHERE id = ?
    `;
    
    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Update blog
  static async update(id, blogData) {
    const fields = [];
    const values = [];
    
    // Dynamically build update query based on provided fields
    if (blogData.title !== undefined) {
      fields.push('title = ?');
      values.push(blogData.title);
    }
    if (blogData.cover_image !== undefined) {
      fields.push('cover_image = ?');
      values.push(blogData.cover_image);
    }
    if (blogData.author !== undefined) {
      fields.push('author = ?');
      values.push(blogData.author);
    }
    if (blogData.read_time !== undefined) {
      fields.push('read_time = ?');
      values.push(blogData.read_time);
    }
    if (blogData.content !== undefined) {
      fields.push('content = ?');
      values.push(blogData.content);
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    
    const query = `
      UPDATE blogs
      SET ${fields.join(', ')}
      WHERE id = ?
    `;
    
    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete blog
  static async delete(id) {
    const query = `DELETE FROM blogs WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }

  // Bulk delete blogs
  static async bulkDelete(ids) {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM blogs WHERE id IN (${placeholders})`;
    const [result] = await promisePool.query(query, ids);
    return result.affectedRows;
  }

  // Search blogs
  static async search(searchTerm, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id, title, cover_image, author, read_time,
             SUBSTRING(content, 1, 200) as excerpt,
             created_at, updated_at
      FROM blogs
      WHERE title LIKE ? OR author LIKE ? OR content LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const [rows] = await promisePool.query(query, [
      searchPattern,
      searchPattern,
      searchPattern,
      parseInt(limit),
      parseInt(offset)
    ]);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total FROM blogs
      WHERE title LIKE ? OR author LIKE ? OR content LIKE ?
    `;
    const [countResult] = await promisePool.query(countQuery, [
      searchPattern,
      searchPattern,
      searchPattern
    ]);
    const total = countResult[0].total;
    
    return {
      blogs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = Blog;
