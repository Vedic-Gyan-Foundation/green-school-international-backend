const express = require('express')
const router = express.Router()
const multer  = require('multer')
const path = require('path')

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, `${path.join(process.cwd(), 'public/gallery')}`)
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
  })

const upload = multer({ storage });

router.post('/upload', upload.array('photos', 12), function (req, res, next) {
    // req.files is array of `photos` files
    // req.body will contain the text fields, if there were any
    // console.log(req.files)
    res.status(200).json({msg: `file uploaded successfully!`})
  })



router.get('/add-form', (req, res)=> {
  res.render('./galleryPage.ejs')
})


module.exports = router