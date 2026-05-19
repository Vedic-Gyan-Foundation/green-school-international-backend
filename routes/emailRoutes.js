const express = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const router = express.Router();

const SCHOOL_EMAIL = 'thegreenschoolinternational@gmail.com';

// OAuth2 setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

async function createTransporter() {
  const accessToken = await oAuth2Client.getAccessToken();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: SCHOOL_EMAIL,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

// Rate limiting: simple in-memory store (per IP, 5 requests per 15 min)
const rateLimitStore = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitStore[ip]) rateLimitStore[ip] = [];
  rateLimitStore[ip] = rateLimitStore[ip].filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (rateLimitStore[ip].length >= RATE_LIMIT_MAX) return false;
  rateLimitStore[ip].push(now);
  return true;
}

// Sanitize input to prevent injection
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\r\n]/g, '').trim();
}

// POST /api/send-admission-enquiry
router.post('/send-admission-enquiry', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  const { childname, fathername, whatsappnumber, class: classGrade, email, address, query } = req.body;

  if (!childname || !fathername || !whatsappnumber || !classGrade || !email || !address || !query) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: `"Green School Admissions" <${SCHOOL_EMAIL}>`,
      to: SCHOOL_EMAIL,
      replyTo: sanitize(email),
      subject: 'New Admission Enquiry',
      html: `
        <h2>New Admission Enquiry</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr><td><strong>Child Name</strong></td><td>${sanitize(childname)}</td></tr>
          <tr><td><strong>Father Name</strong></td><td>${sanitize(fathername)}</td></tr>
          <tr><td><strong>WhatsApp Number</strong></td><td>${sanitize(whatsappnumber)}</td></tr>
          <tr><td><strong>Class</strong></td><td>${sanitize(classGrade)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${sanitize(email)}</td></tr>
          <tr><td><strong>Address</strong></td><td>${sanitize(address)}</td></tr>
          <tr><td><strong>Query</strong></td><td>${sanitize(query)}</td></tr>
        </table>
      `,
    });

    res.json({ success: true, message: 'Enquiry submitted successfully.' });
  } catch (err) {
    console.error('Admission email error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send enquiry. Please try again later.' });
  }
});

// POST /api/send-contact-message
router.post('/send-contact-message', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  const { name, contact, email, subject, message } = req.body;

  if (!name || !contact || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: `"Green School Contact" <${SCHOOL_EMAIL}>`,
      to: SCHOOL_EMAIL,
      replyTo: sanitize(email),
      subject: `Contact: ${sanitize(subject)}`,
      html: `
        <h2>New Contact Message</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr><td><strong>Name</strong></td><td>${sanitize(name)}</td></tr>
          <tr><td><strong>Contact</strong></td><td>${sanitize(contact)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${sanitize(email)}</td></tr>
          <tr><td><strong>Subject</strong></td><td>${sanitize(subject)}</td></tr>
          <tr><td><strong>Message</strong></td><td>${sanitize(message)}</td></tr>
        </table>
      `,
    });

    res.json({ success: true, message: 'Message sent successfully.' });
  } catch (err) {
    console.error('Contact email error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
  }
});

module.exports = router;
