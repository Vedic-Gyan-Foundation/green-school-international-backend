const express = require('express')
const pageRouter = express.Router()


pageRouter.get('/add-form', (req, res)=> {
  res.render('./galleryPage.ejs')
})

pageRouter.get('/add-blog', (req, res)=> {
  res.render('./blogPage.ejs')
})


module.exports = pageRouter