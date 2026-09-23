const express = require('express');
const multer = require('multer');
const path = require('path');
const disclosureRouter = express.Router();
const DisclosureController = require('../controllers/disclosureController');

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

// Get all visible disclosure documents (optional ?section=B)
disclosureRouter.get('/disclosure/readAll', DisclosureController.getAllDisclosure);

// Get single disclosure document by ID
disclosureRouter.get('/disclosure/readOne/:id', DisclosureController.getDisclosureById);

// Create a disclosure document, with or without an uploaded file
disclosureRouter.post('/disclosure/add', uploadDocument, DisclosureController.createDisclosure);

// Update disclosure document, with or without a replacement file
disclosureRouter.put(
  '/disclosure/update/:id',
  uploadDocument,
  DisclosureController.updateDisclosure
);

// Delete disclosure document
disclosureRouter.delete('/disclosure/delete/:id', DisclosureController.deleteDisclosure);

module.exports = disclosureRouter;
