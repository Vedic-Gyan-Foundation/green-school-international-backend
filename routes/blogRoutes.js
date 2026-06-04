const express = require('express');
const multer = require('multer');
const path = require('path');
const blogRouter = express.Router();
const BlogController = require('../controllers/blogController');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'public/blogs'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

// Create a new blog (with optional image upload)
blogRouter.post('/blog/create', BlogController.createBlog);

// Get all blogs with pagination
blogRouter.get('/blog/readAll', BlogController.getAllBlogs);

// Search blogs
blogRouter.get('/blog/search', BlogController.searchBlogs);

// Get single blog by ID
blogRouter.get('/blog/readOne/:id', BlogController.getBlogById);

// Update blog (with optional image upload)
blogRouter.put('/blog/update/:id', BlogController.updateBlog);

// Delete blog
blogRouter.delete('/blog/delete/:id', BlogController.deleteBlog);

// Bulk delete blogs
blogRouter.post('/blog/delete-bulk', BlogController.bulkDeleteBlogs);

// Upload blog Image
blogRouter.post('/blog/image', upload.single('blog_image'), BlogController.uploadBlogImage);

module.exports = blogRouter;
