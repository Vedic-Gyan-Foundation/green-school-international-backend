const express = require('express');
const router = express.Router();
const admissionController = require('../controllers/admissionController');

// Route for submitting admission query
router.post('/admission', admissionController.submitAdmission);

// Route for getting all admissions (could be restricted later)
router.get('/admission', admissionController.getAllAdmissions);

module.exports = router;
