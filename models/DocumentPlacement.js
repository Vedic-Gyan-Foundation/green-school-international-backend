const { promisePool } = require('../config/database');

// The four places on the website a document can be shown. getAllGrouped() always returns a key
// for each one, so the frontend can render a location it has no rows for without guarding.
const LOCATIONS = ['disclosure_b', 'disclosure_c', 'navbar_fee', 'admission_form'];

// A placement is never useful without the document behind it — the label belongs to the spot on
// the page, the file belongs to the document — so every read joins and returns both halves.
const COLUMNS = `p.id, p.document_id, d.name, d.file_url, d.kind, p.label, p.sublabel,
             p.icon, p.link_label, p.is_numbered, p.display_order, p.is_visible`;

class DocumentPlacement {
  // Exposed so controllers validate an incoming `location` against one source of truth
  static LOCATIONS = LOCATIONS;

  // Create a placement — "show this document at this spot, under this label"
  static async create(placementData) {
    const {
      document_id,
      location,
      label,
      sublabel,
      icon,
      link_label,
      is_numbered,
      display_order,
      is_visible
    } = placementData;

    const query = `
      INSERT INTO document_placements
        (document_id, location, label, sublabel, icon, link_label, is_numbered, display_order,
         is_visible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await promisePool.query(query, [
      document_id,
      location,
      label,
      // Empty strings arrive from multipart forms where "not set" and "" are the same thing;
      // store NULL so these columns mean one thing only.
      sublabel || null,
      icon || null,
      link_label || null,
      is_numbered === undefined ? true : is_numbered,
      display_order === undefined ? 0 : display_order,
      is_visible === undefined ? true : is_visible
    ]);

    return result.insertId;
  }

  // Every placement at one location, in the order the page renders them. `onlyVisible` is what
  // the public API passes, so a row the admin hid never leaves the server.
  static async getByLocation(location, onlyVisible = false) {
    const conditions = ['p.location = ?'];
    const values = [location];

    if (onlyVisible) {
      conditions.push('p.is_visible = TRUE');
    }

    const query = `
      SELECT ${COLUMNS}
      FROM document_placements p
      JOIN documents d ON d.id = p.document_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.display_order ASC, p.id ASC
    `;

    const [rows] = await promisePool.query(query, values);
    return rows;
  }

  // Every location in one query, grouped in JS — the whole site's document layout is ~21 rows,
  // so four round trips to the database would buy nothing.
  static async getAllGrouped(onlyVisible = false) {
    const conditions = [];

    if (onlyVisible) {
      conditions.push('p.is_visible = TRUE');
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT ${COLUMNS}, p.location
      FROM document_placements p
      JOIN documents d ON d.id = p.document_id
      ${whereClause}
      ORDER BY p.location ASC, p.display_order ASC, p.id ASC
    `;

    const [rows] = await promisePool.query(query);

    const grouped = {};
    for (const key of LOCATIONS) {
      grouped[key] = [];
    }

    for (const row of rows) {
      // location is the grouping key, not part of an entry — strip it so a grouped entry and a
      // getByLocation() row are the same shape.
      const { location, ...entry } = row;

      if (!grouped[location]) {
        grouped[location] = [];
      }
      grouped[location].push(entry);
    }

    return grouped;
  }

  // Get placement by ID, joined to its document
  static async getById(id) {
    const query = `
      SELECT ${COLUMNS}
      FROM document_placements p
      JOIN documents d ON d.id = p.document_id
      WHERE p.id = ?
    `;

    const [rows] = await promisePool.query(query, [id]);
    return rows[0] || null;
  }

  // Every place one document appears — this is what tells the admin "replacing this file also
  // changes Public Disclosure section C" before they replace it.
  static async getByDocumentId(documentId) {
    const query = `
      SELECT ${COLUMNS}, p.location
      FROM document_placements p
      JOIN documents d ON d.id = p.document_id
      WHERE p.document_id = ?
      ORDER BY p.location ASC, p.display_order ASC, p.id ASC
    `;

    const [rows] = await promisePool.query(query, [documentId]);
    return rows;
  }

  // Update placement
  static async update(id, placementData) {
    const fields = [];
    const values = [];

    if (placementData.document_id !== undefined) {
      fields.push('document_id = ?');
      values.push(placementData.document_id);
    }
    if (placementData.location !== undefined) {
      fields.push('location = ?');
      values.push(placementData.location);
    }
    if (placementData.label !== undefined) {
      fields.push('label = ?');
      values.push(placementData.label);
    }
    if (placementData.sublabel !== undefined) {
      fields.push('sublabel = ?');
      values.push(placementData.sublabel || null);
    }
    if (placementData.icon !== undefined) {
      fields.push('icon = ?');
      values.push(placementData.icon || null);
    }
    if (placementData.link_label !== undefined) {
      fields.push('link_label = ?');
      values.push(placementData.link_label || null);
    }
    if (placementData.is_numbered !== undefined) {
      fields.push('is_numbered = ?');
      values.push(placementData.is_numbered);
    }
    if (placementData.display_order !== undefined) {
      fields.push('display_order = ?');
      values.push(placementData.display_order);
    }
    if (placementData.is_visible !== undefined) {
      fields.push('is_visible = ?');
      values.push(placementData.is_visible);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const query = `
      UPDATE document_placements
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const [result] = await promisePool.query(query, values);
    return result.affectedRows;
  }

  // Delete placement — removes the document from this one spot, leaving it in the library and
  // in every other place it appears.
  static async delete(id) {
    const query = `DELETE FROM document_placements WHERE id = ?`;
    const [result] = await promisePool.query(query, [id]);
    return result.affectedRows;
  }

  // Next free display_order for a location, so a newly placed document lands at the bottom of it
  static async nextDisplayOrder(location) {
    const query = `
      SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
      FROM document_placements WHERE location = ?
    `;

    const [rows] = await promisePool.query(query, [location]);
    return Number(rows[0].next_order);
  }
}

module.exports = DocumentPlacement;
