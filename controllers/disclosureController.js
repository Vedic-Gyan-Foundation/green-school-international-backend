const DocumentPlacement = require('../models/DocumentPlacement');

// DEPRECATED. The disclosure page is now fed by GET /v1/documents/site, and writing is owned by
// documentRoutes.js. What survives here is a single read that answers in the old row shape,
// because the frontend bundle live on greenschoolguwahati.com calls /v1/disclosure/readAll and
// keeps calling it until the rebuilt bundle is deployed — a window in which the compliance page
// would otherwise render nothing but its bundled fallback. Delete this file and its route once
// the new bundle is live.
class DisclosureController {
  // Get all disclosure documents, shaped like the pre-placements disclosure_documents rows
  static async getAllDisclosure(req, res) {
    try {
      // Public endpoint — hidden placements must not leave the server.
      const grouped = await DocumentPlacement.getAllGrouped(true);

      const toLegacyRow = (section) => (entry) => ({
        id: entry.id,
        section,
        title: entry.label,
        file_url: entry.file_url,
        link_label: entry.link_label,
        link_type: entry.kind === 'link' ? 'view' : 'download',
        is_numbered: entry.is_numbered,
        display_order: entry.display_order,
        is_visible: true
      });

      const documents = [
        ...(grouped.disclosure_b || []).map(toLegacyRow('B')),
        ...(grouped.disclosure_c || []).map(toLegacyRow('C'))
      ];

      res.status(200).json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('Get all disclosure documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch disclosure documents',
        error: error.message
      });
    }
  }
}

module.exports = DisclosureController;
