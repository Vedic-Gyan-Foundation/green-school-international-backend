const express = require('express');
const pageRouter = express.Router();
const admissionController = require('../controllers/admissionController');
const { requireAdmin } = require('../middleware/auth');

// Deny by default for the three namespaces this file serves. Every route below ALSO names
// requireAdmin, which is what a reviewer reads; these three lines are the net underneath, so a
// page added later is protected from the moment it is written rather than from the moment
// someone remembers. They are mounted on paths and not on the router, because this router is
// mounted at '/' in app.js: a bare pageRouter.use(requireAdmin) would also intercept every
// public /v1 request on its way past and take the whole public website down with it.
//
// /admin/login is not caught here. authRoutes is mounted above this router and answers it, so
// nothing signed-out ever reaches these lines looking for the login page.
pageRouter.use('/admin', requireAdmin);
pageRouter.use('/add-form', requireAdmin);
pageRouter.use('/add-blog', requireAdmin);
pageRouter.use('/admission-dashboard', requireAdmin);

pageRouter.get('/add-form', requireAdmin, (req, res) => {
  res.render('./galleryPage.ejs');
});

pageRouter.get('/add-blog', requireAdmin, (req, res) => {
  res.render('./blogPage.ejs');
});

pageRouter.get('/admin/blogs/add', requireAdmin, (req, res) => {
  res.render('./blogPage.ejs');
});

// The admissions list is the most sensitive page in the panel - 170 children's names, their
// parents' names, phone numbers and addresses - and it used to sit on its own path behind its
// own nginx credential. It now lives with every other admin page, under the one login.
pageRouter.get('/admin/admissions', requireAdmin, admissionController.renderDashboard);

// Staff and the client have had /admission-dashboard bookmarked for months. A permanent
// redirect keeps those bookmarks working and teaches the browser the new address.
pageRouter.get('/admission-dashboard', requireAdmin, (req, res) => {
  res.redirect(301, '/admin/admissions');
});

pageRouter.get('/admin/gallery/add', requireAdmin, (req, res) => {
  res.render('addGalleryItem.ejs', { success: req.query.success === 'true' });
});

const GalleryController = require('../controllers/galleryController');
pageRouter.get('/admin/gallery', requireAdmin, GalleryController.renderGalleryViewer);

const BlogController = require('../controllers/blogController');
pageRouter.get('/admin/blogs', requireAdmin, BlogController.renderBlogAdmin);
pageRouter.get('/admin/blogs/edit/:id', requireAdmin, BlogController.renderEditBlog);

pageRouter.get('/admin/videos/add', requireAdmin, (req, res) => {
  res.render('addVideoItem.ejs', { success: req.query.success === 'true' });
});

const VideoController = require('../controllers/videoController');
pageRouter.get('/admin/videos', requireAdmin, VideoController.renderVideoAdmin);

const Document = require('../models/Document');
const DocumentPlacement = require('../models/DocumentPlacement');

// Every place on the website a document can be published, in the words someone would use to
// point at it on their own site. The admin pages are organised around this list rather than
// around the tables, because "Section C" and "the Fee Structure menu" are things the client can
// see and click; "placements" are not. All three document pages read their vocabulary here, so
// a spot is named the same way wherever it is mentioned.
const SITE_LOCATIONS = [
  {
    key: 'disclosure_b',
    group: 'Public Disclosure',
    groupUrl: 'https://greenschoolguwahati.com/publicdisclosure',
    groupLinkText: 'greenschoolguwahati.com/publicdisclosure',
    heading: 'Section B \u2014 Documents and Information',
    path: 'Public Disclosure \u2192 Section B - Documents and Information',
    blurb:
      'The first table on the public disclosure page \u2014 the CBSE paperwork: affiliation, society registration, building and fire safety certificates and the rest.',
    numberHeading: 'SL No.',
    splitNumbered: true,
    supportsSublabel: false,
    supportsLinkLabel: true,
    defaultLinkLabel: 'Click to Download',
    defaultNumbered: true
  },
  {
    key: 'disclosure_c',
    group: 'Public Disclosure',
    groupUrl: 'https://greenschoolguwahati.com/publicdisclosure',
    groupLinkText: 'greenschoolguwahati.com/publicdisclosure',
    heading: 'Section C \u2014 Result and Academics',
    path: 'Public Disclosure \u2192 Section C - Result and Academics',
    blurb:
      'The second table on the same page \u2014 the fee structure, the annual academic calendar, the school management list, results and staff details.',
    numberHeading: 'SL No.',
    splitNumbered: true,
    supportsSublabel: false,
    supportsLinkLabel: true,
    defaultLinkLabel: 'Click to Download',
    defaultNumbered: true
  },
  {
    key: 'navbar_fee',
    group: null,
    groupUrl: 'https://greenschoolguwahati.com',
    groupLinkText: 'the top menu on greenschoolguwahati.com',
    heading: 'Top menu \u2192 Fee Structure \u2192 Download PDFs',
    path: 'Top menu \u2192 Fee Structure \u2192 Download PDFs',
    blurb:
      'The Fee Structure button in the menu at the top of every page. Clicking it drops down a short list of PDFs, each with a small grey line and a little picture beside its name.',
    numberHeading: 'Order',
    splitNumbered: false,
    supportsSublabel: true,
    supportsLinkLabel: false,
    defaultLinkLabel: null,
    defaultNumbered: true
  },
  {
    key: 'admission_form',
    group: null,
    groupUrl: 'https://greenschoolguwahati.com/admission',
    groupLinkText: 'greenschoolguwahati.com/admission',
    heading: 'Admissions page \u2192 Download Admission Form button',
    path: 'Admissions page \u2192 Download Admission Form button',
    blurb: 'The Download Admission Form button on the admissions page.',
    numberHeading: 'Order',
    splitNumbered: false,
    supportsSublabel: false,
    supportsLinkLabel: false,
    defaultLinkLabel: null,
    defaultNumbered: false
  }
];

// Three facts the admin pages all need and none of them should work out for itself: the number
// a visitor actually sees, the plain-words name of the spot, and which OTHER spots publish the
// same document. The last one is the whole point of the redesign - replacing one file can
// change several pages, and nobody should find that out afterwards.
function decoratePlacements(grouped) {
  const locationByKey = {};
  SITE_LOCATIONS.forEach((entry) => {
    locationByKey[entry.key] = entry;
  });

  const byDocument = {};

  Object.keys(grouped).forEach((location) => {
    // SL numbers are regulator-facing, so the order is asserted here rather than trusted.
    const rows = (grouped[location] || []).slice().sort((a, b) => {
      const byOrder = Number(a.display_order) - Number(b.display_order);
      return byOrder !== 0 ? byOrder : Number(a.id) - Number(b.id);
    });

    let slNo = 0;

    rows.forEach((row) => {
      row.location = location;
      // The position among the VISIBLE NUMBERED rows, which is what the public page prints.
      // Not display_order, and never the id.
      row.sl_no = row.is_numbered && row.is_visible ? ++slNo : null;

      const entry = locationByKey[location];
      const path = entry ? entry.path : location;
      row.where = row.sl_no ? `${path} (row ${row.sl_no})` : path;

      const key = String(row.document_id);
      byDocument[key] = byDocument[key] || [];
      byDocument[key].push(row);
    });

    grouped[location] = rows;
  });

  Object.keys(byDocument).forEach((key) => {
    const rows = byDocument[key];
    rows.forEach((row) => {
      row.siblings = rows
        .filter((other) => other.id !== row.id)
        .map((other) => ({
          id: other.id,
          location: other.location,
          label: other.label,
          sl_no: other.sl_no,
          where: other.where
        }));
    });
  });

  return { grouped, byDocument };
}

// The document admin pages read the models directly: they need the rows exactly as the public
// pages order them, so there is nothing for a controller to add. No admin GET lives under /v1,
// where nginx authenticates only the non-GET methods.
pageRouter.get('/admin/documents', requireAdmin, async (req, res) => {
  try {
    // Unfiltered on purpose - the admin list has to show hidden placements too, marked as such.
    const grouped = (await DocumentPlacement.getAllGrouped()) || {};
    decoratePlacements(grouped);

    res.render('viewDocuments.ejs', { locations: SITE_LOCATIONS, grouped });
  } catch (error) {
    console.error('Render documents admin error:', error);
    res.status(500).send('Internal Server Error');
  }
});

pageRouter.get('/admin/documents/add', requireAdmin, async (req, res) => {
  try {
    // The list page links here with the block whose "+ Add" button was pressed.
    const requested = String(req.query.location || '').trim();
    const location = SITE_LOCATIONS.some((entry) => entry.key === requested)
      ? requested
      : SITE_LOCATIONS[0].key;

    const [documents, grouped] = await Promise.all([
      Document.getAll(),
      DocumentPlacement.getAllGrouped()
    ]);
    const { byDocument } = decoratePlacements(grouped || {});

    // Publishing a document a second time instead of uploading it twice is the point of the
    // library, so the picker says where each one already appears before it is reused.
    const library = (documents || []).map((doc) => ({
      id: doc.id,
      name: doc.name,
      file_url: doc.file_url,
      kind: doc.kind,
      places: (byDocument[String(doc.id)] || []).map((row) => row.where)
    }));

    res.render('addDocument.ejs', {
      locations: SITE_LOCATIONS,
      location,
      documents: library
    });
  } catch (error) {
    console.error('Render add document error:', error);
    res.status(500).send('Internal Server Error');
  }
});

pageRouter.get('/admin/documents/placement/:id', requireAdmin, async (req, res) => {
  try {
    const grouped = (await DocumentPlacement.getAllGrouped()) || {};
    decoratePlacements(grouped);

    // Found in the whole set rather than fetched on its own: the page has to name the other
    // spots sharing this document, and that answer only exists in the full list.
    const wanted = String(req.params.id);
    let placement = null;

    Object.keys(grouped).forEach((location) => {
      grouped[location].forEach((row) => {
        if (String(row.id) === wanted) {
          placement = row;
        }
      });
    });

    if (!placement) {
      return res.status(404).send('That spot is not on the website any more.');
    }

    res.render('editPlacement.ejs', { locations: SITE_LOCATIONS, placement });
  } catch (error) {
    console.error('Render edit placement error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// The disclosure admin page was live for part of today, so the client may have bookmarked it.
pageRouter.get('/admin/disclosure', requireAdmin, (req, res) => {
  res.redirect(301, '/admin/documents');
});

pageRouter.get('/admin', requireAdmin, (req, res) => {
  res.render('adminDashboard.ejs');
});

module.exports = pageRouter;
