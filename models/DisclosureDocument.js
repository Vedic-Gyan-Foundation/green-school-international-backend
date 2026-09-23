const { promisePool } = require('../config/database');

const COLUMNS = `id, section, title, file_url, link_label, link_type,
             is_numbered, display_order, is_visible, created_at, updated_at`;

class DisclosureDocument {
  // Create a new disclosure document row
  static async create(documentData) {
    const {
      section,
      title,
      file_url,
      link_label,
      link_type,
      is_numbered,
      display_order,
      is_visible
    } = documentData;

    const query = `
      INSERT INTO disclosure_documents
        (section, title, file_url, link_label, link_type, is_numbered, display_order, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await promisePool.query(query, [
      section,
      title,
      file_url,
      link_label || 'Click to Download',
      link_type || 'download',
      is_numbered === undefined ? true : is_numbered,
      display_order === undefined ? 0 : display_order,
      is_visible === undefined ? true : is_visible
    ]);

    return result.insertId;
  }

  // Bulk create disclosure document rows
  static async bulkCreate(items) {
    if (!items || items.length === 0) return [];

    const query = `
      INSERT INTO disclosure_documents
        (section, title, file_url, link_label, link_type, is_numbered, display_order, is_visible)
      VALUES ?
    `;

    const values = items.map((item) => [
      item.section,
      item.title || '',
      item.file_url || '',
      item.link_label || 'Click to Download',
      item.link_type || 'download',
      item.is_numbered === undefined ? true : item.is_numbered,
      item.display_order === undefined ? 0 : item.display_order,
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

  // Get all disclosure document rows. Both filters are optional and compose:
  // `onlyVisible` is what the public API passes, so a row the admin hid never leaves the
  // server; `section` narrows to one section of the page. No pagination — the whole list is
  // ~17 rows and the disclosure page renders every one of them.
  static async getAll({ section, onlyVisible } = {}) {
    const conditions = [];
    const values = [];

    if (onlyVisible) {
      conditions.push('is_visible = TRUE');
    }
    if (section) {
      conditions.push('section = ?');
      values.push(section);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT ${COLUMNS}
      FROM disclosure_documents
      ${whereClause}
      ORDER BY section ASC, display_order ASC, id ASC
    `;

    const [rows] = await promisePool.query(query, values);
    return rows;
  }

  // Get disclosure document row by ID
  static async getById(id) {
    const query = `
      SELECT ${COLUMNS}
      FROM disclosure_documents WHERE id = ?
    `;

    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Update disclosure document row
  static async update(id, documentData) {
    const fields = [];
    const values = [];

    if (documentData.section !== undefined) {
      fields.push('section = ?');
      values.push(documentData.section);
    }
    if (documentData.title !== undefined) {
      fields.push('title = ?');
      values.push(documentData.title);
    }
    if (documentData.file_url !== undefined) {
      fields.push('file_url = ?');
      values.push(documentData.file_url);
    }
    if (documentData.link_label !== undefined) {
      fields.push('link_label = ?');
      values.push(documentData.link_label);
    }
    if (documentData.link_type !== undefined) {
      fields.push('link_type = ?');
      values.push(documentData.link_type);
    }
    if (documentData.is_numbered !== undefined) {
      fields.push('is_numbered = ?');
      values.push(documentData.is_numbered);
    }
    if (documentData.display_order !== undefined) {
      fields.push('display_order = ?');
      values.push(documentData.display_order);
    }
    if (documentData.is_visible !== undefined) {
      fields.push('is_visible = ?');
      values.push(documentData.is_visible);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const query = `
      UPDATE disclosure_documents
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete disclosure document row
  static async delete(id) {
    const query = `DELETE FROM disclosure_documents WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }

  // Next free display_order for a section, so a newly added row lands at the bottom of it
  static async nextDisplayOrder(section) {
    const query = `
      SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
      FROM disclosure_documents WHERE section = ?
    `;

    const [rows] = await promisePool.query(query, [section]);
    return Number(rows[0].next_order);
  }

  // Count rows in a section
  static async countBySection(section) {
    const query = `SELECT COUNT(*) AS total FROM disclosure_documents WHERE section = ?`;
    const [rows] = await promisePool.query(query, [section]);
    return Number(rows[0].total);
  }
}

module.exports = DisclosureDocument;
