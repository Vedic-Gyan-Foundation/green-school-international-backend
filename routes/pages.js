const express = require('express');
const pageRouter = express.Router();
const admissionController = require('../controllers/admissionController');

pageRouter.get('/add-form', (req, res) => {
  res.render('./galleryPage.ejs');
});

pageRouter.get('/add-blog', (req, res) => {
  res.render('./blogPage.ejs');
});

pageRouter.get('/admin/blogs/add', (req, res) => {
  res.render('./blogPage.ejs');
});

pageRouter.get('/admission-dashboard', admissionController.renderDashboard);

pageRouter.get('/admin/gallery/add', (req, res) => {
  res.render('addGalleryItem.ejs', { success: req.query.success === 'true' });
});

const GalleryController = require('../controllers/galleryController');
pageRouter.get('/admin/gallery', GalleryController.renderGalleryViewer);

const BlogController = require('../controllers/blogController');
pageRouter.get('/admin/blogs', BlogController.renderBlogAdmin);
pageRouter.get('/admin/blogs/edit/:id', BlogController.renderEditBlog);

pageRouter.get('/admin/videos/add', (req, res) => {
  res.render('addVideoItem.ejs', { success: req.query.success === 'true' });
});

const VideoController = require('../controllers/videoController');
pageRouter.get('/admin/videos', VideoController.renderVideoAdmin);

const DisclosureDocument = require('../models/DisclosureDocument');

// The disclosure admin pages read the model directly: they only need the rows the way the
// public page orders them, so there is nothing for a controller to add.
pageRouter.get('/admin/disclosure', async (req, res) => {
  try {
    // Unfiltered on purpose — the admin table has to show hidden rows too.
    const rows = await DisclosureDocument.getAll();

    res.render('viewDisclosure.ejs', {
      sectionB: rows.filter((row) => row.section === 'B'),
      sectionC: rows.filter((row) => row.section === 'C'),
      otherSections: rows.filter((row) => row.section !== 'B' && row.section !== 'C')
    });
  } catch (error) {
    console.error('Render disclosure admin error:', error);
    res.status(500).send('Internal Server Error');
  }
});

pageRouter.get('/admin/disclosure/add', (req, res) => {
  // The list page links here with the letter of the block whose "+ Add" button was pressed, and
  // the schema allows any single letter. Collapsing anything but C to B would silently file a
  // section D row under B, so keep whatever letter arrived.
  const requested = String(req.query.section || '')
    .trim()
    .toUpperCase();

  res.render('addDisclosureItem.ejs', {
    section: /^[A-Z]$/.test(requested) ? requested : 'B'
  });
});

pageRouter.get('/admin/disclosure/edit/:id', async (req, res) => {
  try {
    const item = await DisclosureDocument.getById(req.params.id);
    if (!item) {
      return res.status(404).send('Disclosure row not found');
    }

    // The page names the current document by its filename; an admin recognises
    // FIRE_NOC.pdf, not the URL it happens to live at.
    const path = String(item.file_url || '').split('?')[0];
    let currentFileName = path.substring(path.lastIndexOf('/') + 1) || path;
    try {
      currentFileName = decodeURIComponent(currentFileName);
    } catch (error) {
      // A filename with a stray % is still a usable label as-is.
    }

    res.render('editDisclosurePage.ejs', { item, currentFileName });
  } catch (error) {
    console.error('Render edit disclosure error:', error);
    res.status(500).send('Internal Server Error');
  }
});

pageRouter.get('/admin', (req, res) => {
  res.render('adminDashboard.ejs');
});

module.exports = pageRouter;
