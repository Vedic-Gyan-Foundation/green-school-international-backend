const DisclosureDocument = require('../models/DisclosureDocument');

const LINK_TYPES = ['download', 'view'];
const DEFAULT_LINK_LABELS = {
  download: 'Click to Download',
  view: 'Click to View'
};

class DisclosureController {
  static isLocalHost(host) {
    return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(String(host || ''));
  }

  static buildDisclosureFileUrl(req, filename) {
    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const host = req.get('host');

    // nginx terminates TLS and proxies to http://localhost:3000 without setting
    // X-Forwarded-Proto, so req.secure and req.protocol both read http for a request the
    // browser made over https. Storing that http:// URL would turn every replaced document
    // into a blocked mixed-content fetch on the https disclosure page, so any host that is
    // not a local dev host is assumed to be behind TLS. A forwarded header still wins, in
    // case nginx grows one later.
    const isHttps = forwardedProto
      ? forwardedProto === 'https'
      : req.secure || req.protocol === 'https' || !DisclosureController.isLocalHost(host);

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

  // Returns the canonical single-letter section, or null when the value is not one
  static normalizeSection(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toUpperCase();
    return /^[A-Z]$/.test(normalized) ? normalized : null;
  }

  static normalizeLinkType(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    return LINK_TYPES.includes(normalized) ? normalized : null;
  }

  // Returns null for absent, blank or non-numeric input so callers can pick their own fallback
  static parseDisplayOrder(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  // onlyVisible is what the public endpoint passes; the admin pages read the model directly
  static async listDisclosure(req, res, onlyVisible) {
    const { section } = req.query;
    let filterSection;

    if (section !== undefined && String(section).trim() !== '') {
      filterSection = DisclosureController.normalizeSection(section);
      if (!filterSection) {
        return res.status(400).json({
          success: false,
          message: 'Section filter must be a single letter (for example B or C)'
        });
      }
    }

    const documents = await DisclosureDocument.getAll({ section: filterSection, onlyVisible });

    res.status(200).json({
      success: true,
      data: documents
    });
  }

  // Create a new disclosure document
  static async createDisclosure(req, res) {
    try {
      const { title, file_url, link_label, link_type, is_numbered, is_visible, display_order } =
        req.body;

      const section = DisclosureController.normalizeSection(req.body.section);
      if (!section) {
        return res.status(400).json({
          success: false,
          message: 'Section is required and must be a single letter (for example B or C)'
        });
      }

      if (!title || !String(title).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Title is required'
        });
      }

      const linkType =
        link_type === undefined || link_type === ''
          ? 'download'
          : DisclosureController.normalizeLinkType(link_type);

      if (!linkType) {
        return res.status(400).json({
          success: false,
          message: `link_type must be one of: ${LINK_TYPES.join(', ')}`
        });
      }

      // An uploaded file wins over a pasted URL. Without either, the row would render a dead link.
      const fileUrl = req.file
        ? DisclosureController.buildDisclosureFileUrl(req, req.file.filename)
        : String(file_url || '').trim();

      if (!fileUrl) {
        return res.status(400).json({
          success: false,
          message: 'A document file or a file_url is required'
        });
      }

      const requestedOrder = DisclosureController.parseDisplayOrder(display_order);
      const label = String(link_label || '').trim();

      const disclosureData = {
        section,
        title: String(title).trim(),
        file_url: fileUrl,
        link_label: label || DEFAULT_LINK_LABELS[linkType],
        link_type: linkType,
        is_numbered: DisclosureController.parseBoolean(is_numbered),
        is_visible: DisclosureController.parseBoolean(is_visible),
        display_order:
          requestedOrder === null
            ? await DisclosureDocument.nextDisplayOrder(section)
            : requestedOrder
      };

      const disclosureId = await DisclosureDocument.create(disclosureData);
      const newDisclosure = await DisclosureDocument.getById(disclosureId);

      res.status(201).json({
        success: true,
        message: 'Disclosure document created successfully',
        data: newDisclosure
      });
    } catch (error) {
      console.error('Create disclosure document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create disclosure document',
        error: error.message
      });
    }
  }

  // Upload a document file without creating a row

  // Get all disclosure documents
  static async getAllDisclosure(req, res) {
    try {
      // Public endpoint — hidden rows must not leave the server.
      await DisclosureController.listDisclosure(req, res, true);
    } catch (error) {
      console.error('Get all disclosure documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch disclosure documents',
        error: error.message
      });
    }
  }

  // Get all disclosure documents including hidden ones

  // Get single disclosure document by ID
  static async getDisclosureById(req, res) {
    try {
      const { id } = req.params;
      const disclosure = await DisclosureDocument.getById(id);

      if (!disclosure) {
        return res.status(404).json({
          success: false,
          message: 'Disclosure document not found'
        });
      }

      res.status(200).json({
        success: true,
        data: disclosure
      });
    } catch (error) {
      console.error('Get disclosure document by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch disclosure document',
        error: error.message
      });
    }
  }

  // Update disclosure document
  static async updateDisclosure(req, res) {
    try {
      const { id } = req.params;

      const existingDisclosure = await DisclosureDocument.getById(id);
      if (!existingDisclosure) {
        return res.status(404).json({
          success: false,
          message: 'Disclosure document not found'
        });
      }

      // Built from the keys actually present, so a form that posts a subset of the fields
      // cannot blank out the rest.
      const updateData = {};

      if (req.body.section !== undefined) {
        const section = DisclosureController.normalizeSection(req.body.section);
        if (!section) {
          return res.status(400).json({
            success: false,
            message: 'Section must be a single letter (for example B or C)'
          });
        }
        updateData.section = section;
      }

      if (req.body.title !== undefined) {
        const title = String(req.body.title).trim();
        if (!title) {
          return res.status(400).json({
            success: false,
            message: 'Title cannot be empty'
          });
        }
        updateData.title = title;
      }

      if (req.body.link_type !== undefined) {
        const linkType = DisclosureController.normalizeLinkType(req.body.link_type);
        if (!linkType) {
          return res.status(400).json({
            success: false,
            message: `link_type must be one of: ${LINK_TYPES.join(', ')}`
          });
        }
        updateData.link_type = linkType;
      }

      if (req.body.link_label !== undefined) {
        const label = String(req.body.link_label).trim();
        updateData.link_label =
          label || DEFAULT_LINK_LABELS[updateData.link_type || existingDisclosure.link_type];
      }

      if (req.body.is_numbered !== undefined) {
        updateData.is_numbered = DisclosureController.parseBoolean(
          req.body.is_numbered,
          Boolean(existingDisclosure.is_numbered)
        );
      }

      if (req.body.is_visible !== undefined) {
        updateData.is_visible = DisclosureController.parseBoolean(
          req.body.is_visible,
          Boolean(existingDisclosure.is_visible)
        );
      }

      if (req.body.display_order !== undefined) {
        const order = DisclosureController.parseDisplayOrder(req.body.display_order);
        if (order !== null) updateData.display_order = order;
      }

      // A replacement upload wins over any file_url posted alongside it. The file it replaces
      // stays on disk: printed circulars and search results still point at the old URL.
      if (req.file) {
        updateData.file_url = DisclosureController.buildDisclosureFileUrl(req, req.file.filename);
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
        await DisclosureDocument.update(id, updateData);
      }

      const updatedDisclosure = await DisclosureDocument.getById(id);

      res.status(200).json({
        success: true,
        message: 'Disclosure document updated successfully',
        data: updatedDisclosure
      });
    } catch (error) {
      console.error('Update disclosure document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update disclosure document',
        error: error.message
      });
    }
  }

  // Delete disclosure document
  static async deleteDisclosure(req, res) {
    try {
      const { id } = req.params;

      const disclosure = await DisclosureDocument.getById(id);
      if (!disclosure) {
        return res.status(404).json({
          success: false,
          message: 'Disclosure document not found'
        });
      }

      const affectedRows = await DisclosureDocument.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete disclosure document'
        });
      }

      // The file on disk is left alone on purpose — it may still be linked elsewhere.
      res.status(200).json({
        success: true,
        message: 'Disclosure document deleted successfully'
      });
    } catch (error) {
      console.error('Delete disclosure document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete disclosure document',
        error: error.message
      });
    }
  }
}

module.exports = DisclosureController;
