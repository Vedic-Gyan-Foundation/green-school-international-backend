const { promisePool } = require('../config/database');

class Gallery {
  // Create a new gallery item
  static async create(galleryData) {
    const { image, caption, sub_caption } = galleryData;
    
    const query = `
      INSERT INTO gallery (image, caption, sub_caption)
      VALUES (?, ?, ?)
    `;
    
    const [result] = await promisePool.query(query, [
      image,
      caption,
      sub_caption || null
    ]);
    
    return result.insertId;
  }

  // Bulk create gallery items
  static async bulkCreate(items) {
    if (!items || items.length === 0) return [];

    const query = `
      INSERT INTO gallery (image, caption, sub_caption)
      VALUES ?
    `;

    const values = items.map(item => [
      item.image,
      item.caption || '',
      item.sub_caption || null
    ]);

    const [result] = await promisePool.query(query, [values]);

    // Return array of inserted IDs
    const ids = [];
    for (let i = 0; i < items.length; i++) {
      ids.push(result.insertId + i);
    }
    return ids;
  }

  // Get all gallery items with pagination
  static async getAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id, image, caption, sub_caption, created_at, updated_at
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
    if (galleryData.sub_caption !== undefined) {
      fields.push('sub_caption = ?');
      values.push(galleryData.sub_caption);
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

  // Bulk delete gallery items
  static async bulkDelete(ids) {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM gallery WHERE id IN (${placeholders})`;
    const [result] = await promisePool.query(query, ids);
    return result.affectedRows;
  }
}

module.exports = Gallery;
