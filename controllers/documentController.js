const Document = require('../models/Document');
const DocumentPlacement = require('../models/DocumentPlacement');

// The wording the admin panel shows for each spot on the website. One document can sit in
// several of them — replacing its file updates all of them at once, which is the whole reason
// placements exist as their own table.
const LOCATION_LABELS = {
  disclosure_b: 'Public Disclosure -> Section B - Documents and Information',
  disclosure_c: 'Public Disclosure -> Section C - Result and Academics',
  navbar_fee: 'Top menu -> Fee Structure -> Download PDFs',
  admission_form: 'Admissions page -> Download Admission Form button'
};

// Taken from the model so validation here and grouping there can never drift apart
const LOCATION_KEYS = DocumentPlacement.LOCATIONS;
const KINDS = ['file', 'link'];
// Only the navbar dropdown renders an icon, and the key is looked up in a fixed map in the
// frontend, so an unrecognised key would draw nothing at all.
const ICONS = ['document', 'sparkles', 'shield'];

class DocumentController {
  static isLocalHost(host) {
    return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(String(host || ''));
  }

  static buildDocumentFileUrl(req, filename) {
    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const host = req.get('host');

    // nginx terminates TLS and proxies to http://localhost:3000 without setting
    // X-Forwarded-Proto, so req.secure and req.protocol both read http for a request the
    // browser made over https. Storing that http:// URL would turn every replaced document
    // into a blocked mixed-content fetch on the https site, so any host that is not a local
    // dev host is assumed to be behind TLS. A forwarded header still wins, in case nginx
    // grows one later.
    const isHttps = forwardedProto
      ? forwardedProto === 'https'
      : req.secure || req.protocol === 'https' || !DocumentController.isLocalHost(host);

    return `${isHttps ? 'https' : 'http'}://${host}/public_disclosure/${filename}`;
  }

  // Normalize a flag coming from JSON (boolean) or a multipart form, where every field is a
  // string and the string 'false' is truthy.
  static parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return !['false', '0', 'off', 'no'].includes(normalized);
  }

  // Returns null for absent, blank or non-numeric input so callers can pick their own fallback
  static parseInteger(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  // Optional text: an empty string from a form means "clear this", which the column stores as NULL
  static trimOrNull(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  }

  // Returns the canonical location key, or null when the value is not one of the four
  static normalizeLocation(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    return LOCATION_KEYS.includes(normalized) ? normalized : null;
  }

  static normalizeKind(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    return KINDS.includes(normalized) ? normalized : null;
  }

  // Spelled out with the human wording, because the admin panel shows this string as-is
  static locationMessage() {
    const options = LOCATION_KEYS.map((key) => `${key} (${LOCATION_LABELS[key] || key})`).join(
      '; '
    );
    return `location must be one of: ${options}`;
  }

  // Everything the website needs, grouped by where it appears.
  static async getSiteDocuments(req, res) {
    try {
      // Public endpoint — hidden placements must not leave the server.
      const grouped = await DocumentPlacement.getAllGrouped(true);

      // Built from the known keys rather than from whatever came back, so the frontend can
      // read data.navbar_fee without guarding for undefined when a location has no rows yet.
      const data = {};
      LOCATION_KEYS.forEach((location) => {
        data[location] = grouped[location] || [];
      });

      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Get site documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch site documents',
        error: error.message
      });
    }
  }

  // Add a document to the library, optionally placing it somewhere on the site straight away
  static async createDocument(req, res) {
    try {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Document name is required'
        });
      }

      const kind =
        req.body.kind === undefined || req.body.kind === ''
          ? 'file'
          : DocumentController.normalizeKind(req.body.kind);

      if (!kind) {
        return res.status(400).json({
          success: false,
          message: `kind must be one of: ${KINDS.join(', ')}`
        });
      }

      const postedUrl = String(req.body.file_url || '').trim();

      if (kind === 'link') {
        if (req.file) {
          return res.status(400).json({
            success: false,
            message:
              'A link opens an external page in a new tab, so it cannot carry an uploaded file. Set kind to "file" to upload a document instead.'
          });
        }
        if (!postedUrl) {
          return res.status(400).json({
            success: false,
            message: 'A link needs a file_url to point at'
          });
        }
      }

      // An uploaded file wins over a pasted URL. Without either, every placement of this
      // document would render a dead link.
      const fileUrl = req.file
        ? DocumentController.buildDocumentFileUrl(req, req.file.filename)
        : postedUrl;

      if (!fileUrl) {
        return res.status(400).json({
          success: false,
          message: 'A document file or a file_url is required'
        });
      }

      // The optional first placement is validated before anything is written, so a typo in the
      // location cannot leave a document in the library that appears nowhere and nobody expects.
      let placementData = null;

      if (req.body.location !== undefined && String(req.body.location).trim() !== '') {
        const location = DocumentController.normalizeLocation(req.body.location);
        if (!location) {
          return res.status(400).json({
            success: false,
            message: DocumentController.locationMessage()
          });
        }

        const label = String(req.body.label || '').trim();
        if (!label) {
          return res.status(400).json({
            success: false,
            message:
              'label is required when a location is given — it is the wording the website shows at that spot'
          });
        }

        const icon = DocumentController.trimOrNull(req.body.icon);
        if (icon && !ICONS.includes(icon)) {
          return res.status(400).json({
            success: false,
            message: `icon must be one of: ${ICONS.join(', ')}`
          });
        }

        placementData = {
          location,
          label,
          sublabel: DocumentController.trimOrNull(req.body.sublabel),
          icon,
          link_label: DocumentController.trimOrNull(req.body.link_label),
          is_numbered: DocumentController.parseBoolean(req.body.is_numbered),
          is_visible: DocumentController.parseBoolean(req.body.is_visible),
          display_order: DocumentController.parseInteger(req.body.display_order)
        };
      }

      const documentId = await Document.create({ name, file_url: fileUrl, kind });

      if (placementData) {
        if (placementData.display_order === null) {
          placementData.display_order = await DocumentPlacement.nextDisplayOrder(
            placementData.location
          );
        }
        await DocumentPlacement.create({ ...placementData, document_id: documentId });
      }

      const newDocument = await Document.getById(documentId);
      const placements = await DocumentPlacement.getByDocumentId(documentId);

      res.status(201).json({
        success: true,
        message: 'Document created successfully',
        data: { ...newDocument, placements }
      });
    } catch (error) {
      console.error('Create document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create document',
        error: error.message
      });
    }
  }

  // Replace a document's file and/or rename it. This is the upload-once action: one write here
  // changes every spot on the website that shows this document.
  static async updateDocument(req, res) {
    try {
      const { id } = req.params;

      const existingDocument = await Document.getById(id);
      if (!existingDocument) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Built from the keys actually present, so a form that posts a subset of the fields
      // cannot blank out the rest.
      const updateData = {};

      if (req.body.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) {
          return res.status(400).json({
            success: false,
            message: 'Document name cannot be empty'
          });
        }
        updateData.name = name;
      }

      if (req.body.kind !== undefined) {
        const kind = DocumentController.normalizeKind(req.body.kind);
        if (!kind) {
          return res.status(400).json({
            success: false,
            message: `kind must be one of: ${KINDS.join(', ')}`
          });
        }
        updateData.kind = kind;
      }

      const effectiveKind = updateData.kind || existingDocument.kind;

      // A link is opened in a new tab rather than downloaded, so a file arriving against one is
      // far more likely to be the wrong row than a deliberate conversion. Say so instead of
      // silently turning a video link into a PDF.
      if (effectiveKind === 'link' && req.file) {
        return res.status(400).json({
          success: false,
          message:
            'This document is a link, so it has no file to replace. Set kind to "file" first if it should become an uploaded document.'
        });
      }

      // A replacement upload wins over any file_url posted alongside it. The file it replaces
      // stays on disk: printed circulars and search results still point at the old URL.
      if (req.file) {
        updateData.file_url = DocumentController.buildDocumentFileUrl(req, req.file.filename);
      } else if (req.body.file_url !== undefined) {
        const fileUrl = String(req.body.file_url).trim();
        if (!fileUrl) {
          return res.status(400).json({
            success: false,
            message: 'file_url cannot be empty'
          });
        }
        updateData.file_url = fileUrl;
      }

      // MySQL reports zero affected rows when the submitted values match what is stored, so an
      // unchanged re-save is a success, not an error. Skip the query only when nothing was sent.
      if (Object.keys(updateData).length > 0) {
        await Document.update(id, updateData);
      }

      const updatedDocument = await Document.getById(id);
      // Returned so the panel can tell the admin what else just changed on the website.
      const placements = await DocumentPlacement.getByDocumentId(id);

      res.status(200).json({
        success: true,
        message: `Document updated successfully. It appears in ${placements.length} place(s) on the website, and every one of them now serves this file.`,
        data: { ...updatedDocument, placements }
      });
    } catch (error) {
      console.error('Update document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update document',
        error: error.message
      });
    }
  }

  // Delete a document and, by cascade, every placement of it
  static async deleteDocument(req, res) {
    try {
      const { id } = req.params;

      const document = await Document.getById(id);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Counted before the delete: the foreign key cascades the placements away with the row,
      // so afterwards there is nothing left to count and nothing to warn the admin about.
      const placementCount = await Document.placementCount(id);

      const affectedRows = await Document.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete document'
        });
      }

      // The file on disk is left alone on purpose — it may still be linked elsewhere.
      res.status(200).json({
        success: true,
        message: `Document deleted successfully, along with ${placementCount} placement(s) on the website`,
        data: { placementCount }
      });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete document',
        error: error.message
      });
    }
  }

  // Show an existing document in one more place on the site
  static async createPlacement(req, res) {
    try {
      const documentId = DocumentController.parseInteger(req.body.document_id);
      if (documentId === null) {
        return res.status(400).json({
          success: false,
          message: 'document_id is required'
        });
      }

      const document = await Document.getById(documentId);
      if (!document) {
        return res.status(400).json({
          success: false,
          message: `No document with id ${documentId} exists — add it to the document library first`
        });
      }

      const location = DocumentController.normalizeLocation(req.body.location);
      if (!location) {
        return res.status(400).json({
          success: false,
          message: DocumentController.locationMessage()
        });
      }

      const label = String(req.body.label || '').trim();
      if (!label) {
        return res.status(400).json({
          success: false,
          message: 'label is required — it is the wording the website shows at that spot'
        });
      }

      const icon = DocumentController.trimOrNull(req.body.icon);
      if (icon && !ICONS.includes(icon)) {
        return res.status(400).json({
          success: false,
          message: `icon must be one of: ${ICONS.join(', ')}`
        });
      }

      const requestedOrder = DocumentController.parseInteger(req.body.display_order);

      const placementData = {
        document_id: documentId,
        location,
        label,
        sublabel: DocumentController.trimOrNull(req.body.sublabel),
        icon,
        link_label: DocumentController.trimOrNull(req.body.link_label),
        is_numbered: DocumentController.parseBoolean(req.body.is_numbered),
        is_visible: DocumentController.parseBoolean(req.body.is_visible),
        display_order:
          requestedOrder === null
            ? await DocumentPlacement.nextDisplayOrder(location)
            : requestedOrder
      };

      const placementId = await DocumentPlacement.create(placementData);
      const newPlacement = await DocumentPlacement.getById(placementId);

      res.status(201).json({
        success: true,
        message: `"${document.name}" now appears in ${LOCATION_LABELS[location] || location}`,
        data: newPlacement
      });
    } catch (error) {
      console.error('Create placement error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create placement',
        error: error.message
      });
    }
  }

  // Change how or where a document appears, without touching the document itself
  static async updatePlacement(req, res) {
    try {
      const { id } = req.params;

      const existingPlacement = await DocumentPlacement.getById(id);
      if (!existingPlacement) {
        return res.status(404).json({
          success: false,
          message: 'Placement not found'
        });
      }

      // Built from the keys actually present, so a form that posts a subset of the fields
      // cannot blank out the rest.
      const updateData = {};

      if (req.body.document_id !== undefined) {
        const documentId = DocumentController.parseInteger(req.body.document_id);
        if (documentId === null) {
          return res.status(400).json({
            success: false,
            message: 'document_id must be a number'
          });
        }

        const document = await Document.getById(documentId);
        if (!document) {
          return res.status(400).json({
            success: false,
            message: `No document with id ${documentId} exists — add it to the document library first`
          });
        }
        updateData.document_id = documentId;
      }

      if (req.body.location !== undefined) {
        const location = DocumentController.normalizeLocation(req.body.location);
        if (!location) {
          return res.status(400).json({
            success: false,
            message: DocumentController.locationMessage()
          });
        }
        updateData.location = location;
      }

      if (req.body.label !== undefined) {
        const label = String(req.body.label).trim();
        if (!label) {
          return res.status(400).json({
            success: false,
            message: 'label cannot be empty'
          });
        }
        updateData.label = label;
      }

      if (req.body.icon !== undefined) {
        const icon = DocumentController.trimOrNull(req.body.icon);
        if (icon && !ICONS.includes(icon)) {
          return res.status(400).json({
            success: false,
            message: `icon must be one of: ${ICONS.join(', ')}`
          });
        }
        updateData.icon = icon;
      }

      // Blank clears these on purpose: a navbar caption moved to a spot that has no room for a
      // subtitle has to be removable.
      if (req.body.sublabel !== undefined) {
        updateData.sublabel = DocumentController.trimOrNull(req.body.sublabel);
      }

      if (req.body.link_label !== undefined) {
        updateData.link_label = DocumentController.trimOrNull(req.body.link_label);
      }

      if (req.body.is_numbered !== undefined) {
        updateData.is_numbered = DocumentController.parseBoolean(
          req.body.is_numbered,
          Boolean(existingPlacement.is_numbered)
        );
      }

      if (req.body.is_visible !== undefined) {
        updateData.is_visible = DocumentController.parseBoolean(
          req.body.is_visible,
          Boolean(existingPlacement.is_visible)
        );
      }

      if (req.body.display_order !== undefined) {
        const order = DocumentController.parseInteger(req.body.display_order);
        if (order !== null) updateData.display_order = order;
      }

      // MySQL reports zero affected rows when the submitted values match what is stored, so an
      // unchanged re-save is a success, not an error. Skip the query only when nothing was sent.
      if (Object.keys(updateData).length > 0) {
        await DocumentPlacement.update(id, updateData);
      }

      const updatedPlacement = await DocumentPlacement.getById(id);

      res.status(200).json({
        success: true,
        message: 'Placement updated successfully',
        data: updatedPlacement
      });
    } catch (error) {
      console.error('Update placement error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update placement',
        error: error.message
      });
    }
  }

  // Stop showing a document in one spot. The document stays in the library, and so does every
  // other placement of it.
  static async deletePlacement(req, res) {
    try {
      const { id } = req.params;

      const placement = await DocumentPlacement.getById(id);
      if (!placement) {
        return res.status(404).json({
          success: false,
          message: 'Placement not found'
        });
      }

      // getById() joins the document but does not select the location column, and naming the
      // spot is what makes the confirmation readable to a non-technical admin. The document's
      // own placements carry it, and they also say what is left after this one goes.
      const siblings = await DocumentPlacement.getByDocumentId(placement.document_id);
      const removed = siblings.find((row) => Number(row.id) === Number(id));
      const spot =
        (removed && (LOCATION_LABELS[removed.location] || removed.location)) || 'the website';

      const affectedRows = await DocumentPlacement.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete placement'
        });
      }

      const remaining = Math.max(siblings.length - 1, 0);

      res.status(200).json({
        success: true,
        message: `Removed from ${spot}. "${placement.name}" is still in the document library and still appears in ${remaining} other place(s).`,
        data: { document_id: placement.document_id, remaining_placements: remaining }
      });
    } catch (error) {
      console.error('Delete placement error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete placement',
        error: error.message
      });
    }
  }
}

module.exports = DocumentController;
