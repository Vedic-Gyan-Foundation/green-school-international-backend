const express = require('express')
const pageRouter = express.Router()
const admissionController = require('../controllers/admissionController')


pageRouter.get('/add-form', (req, res)=> {
  res.render('./galleryPage.ejs')
})

pageRouter.get('/add-blog', (req, res)=> {
  res.render('./blogPage.ejs')
})

pageRouter.get('/admission-dashboard', admissionController.renderDashboard)

pageRouter.get('/admin/gallery/add', (req, res) => {
  res.render('addGalleryItem.ejs', { success: req.query.success === 'true' });
});

const GalleryController = require('../controllers/galleryController');
pageRouter.get('/admin/gallery', GalleryController.renderGalleryViewer);

module.exports = pageRouter