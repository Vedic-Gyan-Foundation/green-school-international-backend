const { promisePool } = require('../config/database');

const COLUMNS = `id, name, file_url, kind, created_at, updated_at`;

class Document {
  // Create a new document (the library entry — a file or an external link the site points at)
  static async create(documentData) {
    const { name, file_url, kind } = documentData;

    const query = `
      INSERT INTO documents (name, file_url, kind)
      VALUES (?, ?, ?)
    `;

    const [result] = await promisePool.query(query, [name, file_url, kind || 'file']);

    return result.insertId;
  }

  // Get document by ID
  static async getById(id) {
    const query = `
      SELECT ${COLUMNS}
      FROM documents WHERE id = ?
    `;

    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Get every document, alphabetically — this is the admin's library picker, so it is ordered
  // the way a human scans a list, not by id. No pagination: the library is a couple of dozen rows.
  static async getAll() {
    const query = `
      SELECT ${COLUMNS}
      FROM documents
      ORDER BY name ASC, id ASC
    `;

    const [rows] = await promisePool.query(query);
    return rows;
  }

  // Update a document. Replacing file_url here is the upload-once action: every placement of
  // this document reads through to it, so all the places it appears on the site change together.
  static async update(id, documentData) {
    const fields = [];
    const values = [];

    if (documentData.name !== undefined) {
      fields.push('name = ?');
      values.push(documentData.name);
    }
    if (documentData.file_url !== undefined) {
      fields.push('file_url = ?');
      values.push(documentData.file_url);
    }
    if (documentData.kind !== undefined) {
      fields.push('kind = ?');
      values.push(documentData.kind);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const query = `
      UPDATE documents
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete a document. document_placements has ON DELETE CASCADE, so this also removes it from
  // every location it appears in — check placementCount() first if the admin should be warned.
  static async delete(id) {
    const query = `DELETE FROM documents WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }

  // Find a document by its exact file_url, so an upload that lands on a path the library
  // already knows reuses that entry instead of forking a second one pointing at the same file.
  static async findByFileUrl(file_url) {
    const query = `
      SELECT ${COLUMNS}
      FROM documents WHERE file_url = ? LIMIT 1
    `;

    const [rows] = await promisePool.query(query, [file_url]);
    return rows[0] || null;
  }

  // How many places on the site this document appears in
  static async placementCount(id) {
    const query = `SELECT COUNT(*) AS total FROM document_placements WHERE document_id = ?`;
    const [rows] = await promisePool.query(query, [id]);
    return Number(rows[0].total);
  }
}

module.exports = Document;
