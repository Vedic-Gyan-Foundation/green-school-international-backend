const express = require('express');
const router = express.Router();
const BlogController = require('../controllers/blogController');
const upload = require('../config/multer');

// Create a new blog (with optional image upload)
router.post('/', upload.single('cover_image'), BlogController.createBlog);

// Get all blogs with pagination
router.get('/', BlogController.getAllBlogs);

// Search blogs
router.get('/search', BlogController.searchBlogs);

// Get single blog by ID
router.get('/:id', BlogController.getBlogById);

// Update blog (with optional image upload)
router.put('/:id', upload.single('cover_image'), BlogController.updateBlog);

// Delete blog
router.delete('/:id', BlogController.deleteBlog);

module.exports = router;
