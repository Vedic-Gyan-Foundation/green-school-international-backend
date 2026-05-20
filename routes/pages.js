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


module.exports = pageRouter