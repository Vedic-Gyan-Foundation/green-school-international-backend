const { promisePool } = require('../config/database');

class Video {
  // Create a new video item
  static async create(videoData) {
    const { url, title, published_at, is_visible } = videoData;

    const query = `
      INSERT INTO videos (url, title, published_at, is_visible)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await promisePool.query(query, [
      url,
      title,
      published_at || null,
      is_visible === undefined ? true : is_visible
    ]);

    return result.insertId;
  }

  // Bulk create video items
  static async bulkCreate(items) {
    if (!items || items.length === 0) return [];

    const query = `
      INSERT INTO videos (url, title, published_at, is_visible)
      VALUES ?
    `;

    const values = items.map((item) => [
      item.url,
      item.title || '',
      item.published_at || null,
      item.is_visible === undefined ? true : item.is_visible
    ]);

    const [result] = await promisePool.query(query, [values]);

    // Return array of inserted IDs
    const ids = [];
    for (let i = 0; i < items.length; i++) {
      ids.push(result.insertId + i);
    }
    return ids;
  }

  // Get all video items with pagination (newest first, undated last).
  // `onlyVisible` is what the public API passes, so a video the admin marked hidden never
  // leaves the server; the admin panel omits it because it has to list hidden rows too.
  static async getAll(page = 1, limit = 10, onlyVisible = false) {
    const offset = (page - 1) * limit;
    const whereClause = onlyVisible ? 'WHERE is_visible = TRUE' : '';

    const query = `
      SELECT id, url, title, published_at, is_visible, created_at, updated_at
      FROM videos
      ${whereClause}
      ORDER BY published_at IS NULL, published_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await promisePool.query(query, [parseInt(limit), parseInt(offset)]);

    // Get total count (same filter, or pagination.total would count rows we never return)
    const [countResult] = await promisePool.query(
      `SELECT COUNT(*) as total FROM videos ${whereClause}`
    );
    const total = countResult[0].total;

    return {
      videos: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get video item by ID
  static async getById(id) {
    const query = `
      SELECT * FROM videos WHERE id = ?
    `;

    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Update video item
  static async update(id, videoData) {
    const fields = [];
    const values = [];

    if (videoData.url !== undefined) {
      fields.push('url = ?');
      values.push(videoData.url);
    }
    if (videoData.title !== undefined) {
      fields.push('title = ?');
      values.push(videoData.title);
    }
    if (videoData.published_at !== undefined) {
      fields.push('published_at = ?');
      values.push(videoData.published_at || null);
    }
    if (videoData.is_visible !== undefined) {
      fields.push('is_visible = ?');
      values.push(videoData.is_visible);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const query = `
      UPDATE videos
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete video item
  static async delete(id) {
    const query = `DELETE FROM videos WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }

  // Bulk delete video items
  static async bulkDelete(ids) {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM videos WHERE id IN (${placeholders})`;
    const [result] = await promisePool.query(query, ids);
    return result.affectedRows;
  }
}

module.exports = Video;
