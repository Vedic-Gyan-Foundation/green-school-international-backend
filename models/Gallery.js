const { promisePool } = require('../config/database');

class Gallery {
  // Create a new gallery item
  static async create(galleryData) {
    const { image, caption } = galleryData;
    
    const query = `
      INSERT INTO gallery (image, caption)
      VALUES (?, ?)
    `;
    
    const [result] = await promisePool.query(query, [
      image,
      caption
    ]);
    
    return result.insertId;
  }

  // Get all gallery items with pagination
  static async getAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id, image, caption, created_at, updated_at
      FROM gallery
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const [rows] = await promisePool.query(query, [parseInt(limit), parseInt(offset)]);
    
    // Get total count
    const [countResult] = await promisePool.query('SELECT COUNT(*) as total FROM gallery');
    const total = countResult[0].total;
    
    return {
      gallery: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get gallery item by ID
  static async getById(id) {
    const query = `
      SELECT * FROM gallery WHERE id = ?
    `;
    
    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Update gallery item
  static async update(id, galleryData) {
    const fields = [];
    const values = [];
    
    if (galleryData.image !== undefined) {
      fields.push('image = ?');
      values.push(galleryData.image);
    }
    if (galleryData.caption !== undefined) {
      fields.push('caption = ?');
      values.push(galleryData.caption);
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    
    const query = `
      UPDATE gallery
      SET ${fields.join(', ')}
      WHERE id = ?
    `;
    
    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete gallery item
  static async delete(id) {
    const query = `DELETE FROM gallery WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }
}

module.exports = Gallery;
