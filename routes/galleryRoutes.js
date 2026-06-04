const express = require('express');
const multer = require('multer');
const path = require('path');
const galleryRouter = express.Router();
const GalleryController = require('../controllers/galleryController');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), 'public/gallery');
    // Ensure directory exists
    if (!require('fs').existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
    cb(null, `gallery_${name}_${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

// Create a new gallery item
galleryRouter.post('/gallery/create', GalleryController.createGallery);

// Get all gallery items with pagination
galleryRouter.get('/gallery/readAll', GalleryController.getAllGallery);

// Get single gallery item by ID
galleryRouter.get('/gallery/readOne/:id', GalleryController.getGalleryById);

// Update gallery item
galleryRouter.put('/gallery/update/:id', GalleryController.updateGallery);

// Delete gallery item
galleryRouter.delete('/gallery/delete/:id', GalleryController.deleteGallery);

// Bulk delete gallery items
galleryRouter.post('/gallery/delete-bulk', GalleryController.bulkDeleteGallery);

// Upload gallery image (single)
galleryRouter.post('/gallery/image', upload.single('gallery_image'), GalleryController.uploadGalleryImage);

// Create gallery item(s) with image upload (supports multi-upload)
galleryRouter.post('/gallery/add', upload.array('gallery_image', 20), GalleryController.createGalleryWithImage);

module.exports = galleryRouter;
