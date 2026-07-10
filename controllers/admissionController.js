const Admission = require('../models/Admission');

/**
 * @desc    Submit a new admission query
 * @route   POST /v1/admission
 * @access  Public
 */
exports.submitAdmission = async (req, res) => {
  try {
    const {
      childname,
      fathername,
      whatsappnumber,
      class: studentClass,
      email,
      address,
      query
    } = req.body;
    // console.log("🚀 ~ req.body:", req.body)

    // Basic validation
    if (!childname || !fathername || !whatsappnumber || !studentClass || !address) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    const admissionId = await Admission.create({
      childname,
      fathername,
      whatsappnumber,
      class: studentClass,
      email,
      address,
      query
    });

    res.status(201).json({
      success: true,
      message: 'Admission query submitted successfully',
      data: { id: admissionId }
    });
  } catch (error) {
    console.error('Error submitting admission:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error. Please try again later.'
    });
  }
};

/**
 * @desc    Get all admission queries
 * @route   GET /v1/admission
 * @access  Private (To be implemented with auth if needed)
 */
exports.getAllAdmissions = async (req, res) => {
  try {
    const admissions = await Admission.getAll();
    res.status(200).json({
      success: true,
      count: admissions.length,
      data: admissions
    });
  } catch (error) {
    console.error('Error getting admissions:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

/**
 * @desc    Render admission dashboard view
 * @route   GET /admission-dashboard
 * @access  Private
 */
exports.renderDashboard = async (req, res) => {
  try {
    const admissions = await Admission.getAll();
    res.render('admissionDashboard.ejs', { admissions });
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
};
