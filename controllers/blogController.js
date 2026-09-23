const Blog = require('../models/Blog');
const fs = require('fs');
const path = require('path');

class BlogController {
  // read_time is stored as a plain integer number of minutes; the API re-attaches ' min'
  // when reading. Blank, zero or anything non-numeric means "no read time", which the
  // website then omits entirely rather than inventing a default.
  static normalizeReadTime(value) {
    if (value === undefined || value === null || value === '') return null;
    const minutes = parseInt(value, 10);
    if (Number.isNaN(minutes) || minutes <= 0) return null;
    return minutes;
  }

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
        read_time: BlogController.normalizeReadTime(read_time),
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
      const { title, author, read_time, content, cover_image } = req.body;

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
      if (content) updateData.content = content;

      // read_time is optional and falls back to '5 min read' on create, so an empty string
      // has to be allowed through here — a truthiness check made it impossible to clear.
      if (read_time !== undefined) {
        updateData.read_time = BlogController.normalizeReadTime(read_time);
      }

      // cover_image was previously never read from the body, so editing the cover image
      // did nothing at all and still reported success. The images are uploaded separately
      // via POST /v1/blog/image, which returns the URL the client sends back here.
      if (cover_image !== undefined) {
        updateData.cover_image = cover_image === '' ? null : cover_image;
      }

      // Kept for multipart callers, though the update route registers no multer middleware.
      if (req.file) {
        updateData.cover_image = `${process.env.APP_URI}/blogs/${req.file.filename}`;
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
    // Without this guard a request carrying no file still answered 200 with
    // `success: true, url: undefined`, so the caller happily stored an empty cover image.
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image was uploaded. Send a file in the "blog_image" field.'
      });
    }

    const url = `${process.env.APP_URI}/blogs/${req.file.filename}`;
    res.status(200).json({ success: true, url });
  }

  // Renders the standalone edit page. The edit UI used to be a modal on the blog list,
  // which was cramped for a full post — title, author, cover image and a rich-text body.
  static async renderEditBlog(req, res) {
    try {
      const blog = await Blog.getById(req.params.id);
      if (!blog) {
        return res.status(404).send('Blog not found');
      }

      // getById formats read_time as '<n> min' for the website; the numeric input here
      // needs the bare number back.
      const readTimeMinutes = blog.read_time ? parseInt(blog.read_time, 10) : '';

      res.render('editBlogPage.ejs', { blog, readTimeMinutes });
    } catch (error) {
      console.error('Render edit blog error:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  // Bulk delete blogs
  static async bulkDeleteBlogs(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of IDs to delete'
        });
      }

      const affectedRows = await Blog.bulkDelete(ids.map((id) => parseInt(id)));

      res.status(200).json({
        success: true,
        message: `${affectedRows} blog(s) deleted successfully`,
        deletedCount: affectedRows
      });
    } catch (error) {
      console.error('Bulk delete blogs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete blogs',
        error: error.message
      });
    }
  }

  // Render blog admin page
  static async renderBlogAdmin(req, res) {
    try {
      const result = await Blog.getAll(1, 500);
      res.render('viewBlogs.ejs', { blogs: result.blogs });
    } catch (error) {
      console.error('Render blog admin error:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = BlogController;
