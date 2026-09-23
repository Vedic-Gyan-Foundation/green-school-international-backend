const Video = require('../models/Video');

class VideoController {
  // Normalize is_visible coming from JSON (boolean) or an HTML form ('on', 'true', '0')
  static parseVisibility(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return !['false', '0', 'off', 'no'].includes(normalized);
  }

  // Create a new video item
  static async createVideo(req, res) {
    try {
      const { url, title, published_at, is_visible } = req.body;

      // Validation
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'Video url is required'
        });
      }

      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Video title is required'
        });
      }

      const videoData = {
        url,
        title,
        published_at: published_at || null,
        is_visible: VideoController.parseVisibility(is_visible)
      };

      const videoId = await Video.create(videoData);
      const newVideo = await Video.getById(videoId);

      res.status(201).json({
        success: true,
        message: 'Video created successfully',
        data: newVideo
      });
    } catch (error) {
      console.error('Create video error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create video',
        error: error.message
      });
    }
  }

  // Get all videos with pagination
  static async getAllVideos(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;

      // Public endpoint — hidden videos must not leave the server.
      const result = await Video.getAll(page, limit, true);

      res.status(200).json({
        success: true,
        data: result.videos,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Get all videos error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch videos',
        error: error.message
      });
    }
  }

  // Get single video by ID
  static async getVideoById(req, res) {
    try {
      const { id } = req.params;
      const video = await Video.getById(id);

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      res.status(200).json({
        success: true,
        data: video
      });
    } catch (error) {
      console.error('Get video by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch video',
        error: error.message
      });
    }
  }

  // Update video
  static async updateVideo(req, res) {
    try {
      const { id } = req.params;
      const { url, title, published_at, is_visible } = req.body;

      // Check if video exists
      const existingVideo = await Video.getById(id);
      if (!existingVideo) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      const updateData = {};
      if (url !== undefined) updateData.url = url;
      if (title !== undefined) updateData.title = title;
      if (published_at !== undefined) updateData.published_at = published_at || null;
      if (is_visible !== undefined) {
        updateData.is_visible = VideoController.parseVisibility(is_visible);
      }

      const affectedRows = await Video.update(id, updateData);

      if (affectedRows === 0 && Object.keys(updateData).length > 0) {
        return res.status(400).json({
          success: false,
          message: 'No changes made'
        });
      }

      const updatedVideo = await Video.getById(id);

      res.status(200).json({
        success: true,
        message: 'Video updated successfully',
        data: updatedVideo
      });
    } catch (error) {
      console.error('Update video error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update video',
        error: error.message
      });
    }
  }

  // Delete video
  static async deleteVideo(req, res) {
    try {
      const { id } = req.params;

      // Get video to check if it exists
      const video = await Video.getById(id);
      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      const affectedRows = await Video.delete(id);

      if (affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete video'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Video deleted successfully'
      });
    } catch (error) {
      console.error('Delete video error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete video',
        error: error.message
      });
    }
  }

  // Bulk delete videos
  static async bulkDeleteVideo(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of IDs to delete'
        });
      }

      const affectedRows = await Video.bulkDelete(ids.map((id) => parseInt(id)));

      res.status(200).json({
        success: true,
        message: `${affectedRows} video(s) deleted successfully`,
        deletedCount: affectedRows
      });
    } catch (error) {
      console.error('Bulk delete video error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete videos',
        error: error.message
      });
    }
  }

  // Render video admin page
  static async renderVideoAdmin(req, res) {
    try {
      // Fetch all items (using a large limit to avoid pagination as requested).
      // Unfiltered on purpose: the admin table has to show hidden videos too.
      const result = await Video.getAll(1, 1000);
      const videoItems = result.videos || [];

      res.render('viewVideos.ejs', { videoItems });
    } catch (error) {
      console.error('Render video admin error:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = VideoController;
