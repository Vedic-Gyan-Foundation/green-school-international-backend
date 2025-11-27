const Blog = require('../models/Blog');
const fs = require('fs');
const path = require('path');

class BlogController {
  // Create a new blog
  static async createBlog(req, res) {
    try {
      const { title, author, read_time, content, cover_image } = req.body;

      // Validation
      if (!title || !author || !content) {
        return res.status(400).json({
          success: false,
          message: 'Title, author, and content are required'
        });
      }

      const blogData = {
        title,
        cover_image,
        author,
        read_time: read_time || '5 min read',
        content
      };

      const blogId = await Blog.create(blogData);
      const newBlog = await Blog.getById(blogId);

      res.status(201).json({
        success: true,
        message: 'Blog created successfully',
        data: newBlog
      });
    } catch (error) {
      console.error('Create blog error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create blog',
        error: error.message
      });
    }
  }

  // Get all blogs with pagination
  static async getAllBlogs(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await Blog.getAll(page, limit);

      res.status(200).json({
        success: true,
        data: result.blogs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Get all blogs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch blogs',
        error: error.message
      });
    }
  }

  // Get single blog by ID
  static async getBlogById(req, res) {
    try {
      const { id } = req.params;
      const blog = await Blog.getById(id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
      }

      res.status(200).json({
        success: true,
        data: blog
      });
    } catch (error) {
      console.error('Get blog by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch blog',
        error: error.message
      });
    }
  }

  // Update blog
  static async updateBlog(req, res) {
    try {
      const { id } = req.params;
      const { title, author, read_time, content } = req.body;

      // Check if blog exists
      const existingBlog = await Blog.getById(id);
      if (!existingBlog) {
        // Delete uploaded file if blog doesn't exist
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
      }

      const updateData = {};
      if (title) updateData.title = title;
      if (author) updateData.author = author;
      if (read_time) updateData.read_time = read_time;
      if (content) updateData.content = content;

      // Handle cover image update
      if (req.file) {
        updateData.cover_image = `/uploads/${req.file.filename}`;
        
        // Delete old image if exists and is a local file
        if (existingBlog.cover_image && existingBlog.cover_image.startsWith('/uploads/')) {
          const oldImagePath = path.join(__dirname, '..', existingBlog.cover_image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }

      const affectedRows = await Blog.update(id, updateData);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'No changes made'
        });
      }

      const updatedBlog = await Blog.getById(id);

      res.status(200).json({
        success: true,
        message: 'Blog updated successfully',
        data: updatedBlog
      });
    } catch (error) {
      console.error('Update blog error:', error);
      // Delete uploaded file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: 'Failed to update blog',
        error: error.message
      });
    }
  }

  // Delete blog
  static async deleteBlog(req, res) {
    try {
      const { id } = req.params;

      // Get blog to check if it exists and get image path
      const blog = await Blog.getById(id);
      if (!blog) {
        return res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
      }

      // Delete blog from database
      const affectedRows = await Blog.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete blog'
        });
      }

      // Delete associated image if exists and is local
      // if (blog.cover_image && blog.cover_image.startsWith('/uploads/')) {
      //   const imagePath = path.join(__dirname, '..', blog.cover_image);
      //   if (fs.existsSync(imagePath)) {
      //     fs.unlinkSync(imagePath);
      //   }
      // }

      res.status(200).json({
        success: true,
        message: 'Blog deleted successfully'
      });
    } catch (error) {
      console.error('Delete blog error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete blog',
        error: error.message
      });
    }
  }

  // Search blogs
  static async searchBlogs(req, res) {
    try {
      const { q } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const result = await Blog.search(q, page, limit);

      res.status(200).json({
        success: true,
        data: result.blogs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Search blogs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search blogs',
        error: error.message
      });
    }
  }


  // Upload image 
  static async uploadBlogImage(req, res) {
    const filename = req.file && `${process.env.APP_URI}/blogs/${req.file.filename}`
    res.status(200).json({success: true, url: filename})
  }
}

module.exports = BlogController;
