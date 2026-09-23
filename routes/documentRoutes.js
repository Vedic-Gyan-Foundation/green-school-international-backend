const express = require('express');
const multer = require('multer');
const path = require('path');
const documentRouter = express.Router();
const DocumentController = require('../controllers/documentController');

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];
// Matched to nginx's client_max_body_size. Anything larger is rejected by nginx before it
// reaches Express, so a higher limit here would only advertise a size the server refuses.
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Resolved from this file rather than from process.cwd(), so it is always the same
// directory app.js hands to express.static. A pm2 restart with a different working
// directory would otherwise park uploads where nothing serves them, and the admin panel
// would report a successful replace behind a link that 404s.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'public_disclosure');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure directory exists
    if (!require('fs').existsSync(UPLOAD_DIR)) {
      require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`Unsupported file type "${ext || file.originalname}"`));
    }
    cb(null, true);
  }
});

// A rejected type or an oversize upload reaches Express as an error, which would answer the
// admin panel's fetch() with an HTML error page instead of the JSON it parses.
const uploadDocument = (req, res, next) => {
  upload.single('document')(req, res, (error) => {
    if (!error) return next();

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 20MB'
        : `${error.message}. Allowed file types: ${ALLOWED_EXTENSIONS.join(', ')}`;

    res.status(400).json({
      success: false,
      message
    });
  });
};

// Everything the website shows, grouped by where it appears. Public by design.
//
// There is deliberately no admin GET here: nginx only requires basic auth for non-GET
// requests under /v1, so any GET added to this router would be readable by anyone. The admin
// pages read the models directly in routes/pages.js instead.
documentRouter.get('/documents/site', DocumentController.getSiteDocuments);

// Add a document to the library, with or without an uploaded file
documentRouter.post('/documents/add', uploadDocument, DocumentController.createDocument);

// Replace a document's file and/or rename it — this updates every placement of it at once
documentRouter.put('/documents/update/:id', uploadDocument, DocumentController.updateDocument);

// Delete a document and, by cascade, every placement of it
documentRouter.delete('/documents/delete/:id', DocumentController.deleteDocument);

// Show an existing document in one more spot on the site
documentRouter.post('/placements/add', DocumentController.createPlacement);

// Change how or where a document appears
documentRouter.put('/placements/update/:id', DocumentController.updatePlacement);

// Stop showing a document in one spot, leaving the document itself in the library
documentRouter.delete('/placements/delete/:id', DocumentController.deletePlacement);

module.exports = documentRouter;
