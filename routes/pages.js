const express = require('express')
const pageRouter = express.Router()


pageRouter.get('/add-form', (req, res)=> {
  res.render('./galleryPage.ejs')
})


module.exports = pageRouter