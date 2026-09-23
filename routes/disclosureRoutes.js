const express = require('express');
const disclosureRouter = express.Router();
const DisclosureController = require('../controllers/disclosureController');

// DEPRECATED compatibility alias for GET /v1/documents/site.
//
// The add/update/delete routes that used to live here are gone; documentRoutes.js owns writing
// now. This one read stays only so the frontend bundle currently live on the site keeps
// rendering the public disclosure page during the window between restarting this backend and
// deploying the rebuilt frontend. Remove it once that bundle is out.
disclosureRouter.get('/disclosure/readAll', DisclosureController.getAllDisclosure);

module.exports = disclosureRouter;
