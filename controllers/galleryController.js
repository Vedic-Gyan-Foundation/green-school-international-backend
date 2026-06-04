const Gallery = require('../models/Gallery');
const fs = require('fs');
const path = require('path');

class GalleryController {
  // Create a new gallery item
  static async createGallery(req, res) {
    try {
      const { caption, image } = req.body;

      // Validation
      if (!image) {
        return res.status(400).json({
          success: false,
          message: 'Image is required'
        });
      }

      const galleryData = {
        image,
        caption: caption || ''
      };

      const galleryId = await Gallery.create(galleryData);
      const newGallery = await Gallery.getById(galleryId);

      res.status(201).json({
        success: true,
        message: 'Gallery item created successfully',
        data: newGallery
      });
    } catch (error) {
      console.error('Create gallery error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create gallery item',
        error: error.message
      });
    }
  }

  // Get all gallery items with pagination
  static async getAllGallery(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;

      const result = await Gallery.getAll(page, limit);

      res.status(200).json({
        success: true,
        data: result.gallery,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Get all gallery error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch gallery items',
        error: error.message
      });
    }
  }

  // Get single gallery item by ID
  static async getGalleryById(req, res) {
    try {
      const { id } = req.params;
      const gallery = await Gallery.getById(id);

      if (!gallery) {
        return res.status(404).json({
          success: false,
          message: 'Gallery item not found'
        });
      }

      res.status(200).json({
        success: true,
        data: gallery
      });
    } catch (error) {
      console.error('Get gallery item by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch gallery item',
        error: error.message
      });
    }
  }

  // Update gallery item
  static async updateGallery(req, res) {
    try {
      const { id } = req.params;
      const { caption, image } = req.body;

      // Check if gallery item exists
      const existingGallery = await Gallery.getById(id);
      if (!existingGallery) {
        return res.status(404).json({
          success: false,
          message: 'Gallery item not found'
        });
      }

      const updateData = {};
      if (caption !== undefined) updateData.caption = caption;
      if (image !== undefined) updateData.image = image;

      const affectedRows = await Gallery.update(id, updateData);

      if (affectedRows === 0 && Object.keys(updateData).length > 0) {
        return res.status(400).json({
          success: false,
          message: 'No changes made'
        });
      }

      const updatedGallery = await Gallery.getById(id);

      res.status(200).json({
        success: true,
        message: 'Gallery item updated successfully',
        data: updatedGallery
      });
    } catch (error) {
      console.error('Update gallery error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update gallery item',
        error: error.message
      });
    }
  }

  // Create gallery item with image upload (for multipart/form-data)
  static async createGalleryWithImage(req, res) {
    try {
      const { caption } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      const imageUrl = `${process.env.APP_URI || ''}/gallery/${req.file.filename}`;
      
      const galleryData = {
        image: imageUrl,
        caption: caption || ''
      };

      const galleryId = await Gallery.create(galleryData);
      const newGallery = await Gallery.getById(galleryId);

      // If it's a browser request (EJS), we might want to redirect
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/admin/gallery?success=true');
      }

      res.status(201).json({
        success: true,
        message: 'Gallery item created successfully',
        data: newGallery
      });
    } catch (error) {
      console.error('Create gallery with image error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create gallery item',
        error: error.message
      });
    }
  }

  // Delete gallery item
  static async deleteGallery(req, res) {
    try {
      const { id } = req.params;

      // Get gallery item to check if it exists
      const gallery = await Gallery.getById(id);
      if (!gallery) {
        return res.status(404).json({
          success: false,
          message: 'Gallery item not found'
        });
      }

      // Delete from database
      const affectedRows = await Gallery.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete gallery item'
        });
      }

      // Note: If images are stored locally and you want to delete them from disk,
      // you would add that logic here, similar to the blog controller's logic.

      res.status(200).json({
        success: true,
        message: 'Gallery item deleted successfully'
      });
    } catch (error) {
      console.error('Delete gallery error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete gallery item',
        error: error.message
      });
    }
  }

  // Upload gallery image
  static async uploadGalleryImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }
      
      const filename = `${process.env.APP_URI}/gallery/${req.file.filename}`;
      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        url: filename
      });
    } catch (error) {
      console.error('Upload gallery image error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload image',
        error: error.message
      });
    }
  }

  // Render gallery viewer page
  static async renderGalleryViewer(req, res) {
    try {
      // Fetch all items (using a large limit to avoid pagination as requested)
      const result = await Gallery.getAll(1, 1000);
      res.render('viewGallery.ejs', { galleryItems: result.gallery });
    } catch (error) {
      console.error('Render gallery viewer error:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = GalleryController;
