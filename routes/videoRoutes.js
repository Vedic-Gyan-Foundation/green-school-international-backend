const express = require('express');
const videoRouter = express.Router();
const VideoController = require('../controllers/videoController');

// Create a new video
videoRouter.post('/video/create', VideoController.createVideo);

// Get all videos with pagination
videoRouter.get('/video/readAll', VideoController.getAllVideos);

// Get single video by ID
videoRouter.get('/video/readOne/:id', VideoController.getVideoById);

// Update video
videoRouter.put('/video/update/:id', VideoController.updateVideo);

// Delete video
videoRouter.delete('/video/delete/:id', VideoController.deleteVideo);

// Bulk delete videos
videoRouter.post('/video/delete-bulk', VideoController.bulkDeleteVideo);

module.exports = videoRouter;
