const Gallery = require('../models/Gallery');
const fs = require('fs');
const path = require('path');

class GalleryController {
  // Create a new gallery item
  static async createGallery(req, res) {
    try {
      const { caption, sub_caption, image } = req.body;

      // Validation
      if (!image) {
        return res.status(400).json({
          success: false,
          message: 'Image is required'
        });
      }

      const galleryData = {
        image,
        caption: caption || '',
        sub_caption: sub_caption || null
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
      const { caption, sub_caption, image } = req.body;

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
      if (sub_caption !== undefined) updateData.sub_caption = sub_caption;
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

  // Create gallery item(s) with image upload (supports single & multi upload)
  static async createGalleryWithImage(req, res) {
    try {
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No image file(s) provided'
        });
      }

      // caption[] and sub_caption[] come as arrays from the form
      const captions = Array.isArray(req.body.caption)
        ? req.body.caption
        : [req.body.caption || ''];
      const subCaptions = Array.isArray(req.body.sub_caption)
        ? req.body.sub_caption
        : [req.body.sub_caption || ''];

      const items = files.map((file, index) => ({
        image: `${process.env.APP_URI || ''}/gallery/${file.filename}`,
        caption: captions[index] || '',
        sub_caption: subCaptions[index] || null
      }));

      const insertedIds = await Gallery.bulkCreate(items);

      // If it's a browser request (EJS), redirect
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/admin/gallery?success=true');
      }

      // Fetch all newly created items for API response
      const newItems = [];
      for (const id of insertedIds) {
        const item = await Gallery.getById(id);
        if (item) newItems.push(item);
      }

      res.status(201).json({
        success: true,
        message: `${newItems.length} gallery item(s) created successfully`,
        data: newItems
      });
    } catch (error) {
      console.error('Create gallery with image error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create gallery item(s)',
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

  // Bulk delete gallery items
  static async bulkDeleteGallery(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of IDs to delete'
        });
      }

      const affectedRows = await Gallery.bulkDelete(ids.map((id) => parseInt(id)));

      res.status(200).json({
        success: true,
        message: `${affectedRows} gallery item(s) deleted successfully`,
        deletedCount: affectedRows
      });
    } catch (error) {
      console.error('Bulk delete gallery error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete gallery items',
        error: error.message
      });
    }
  }
}

module.exports = GalleryController;
