const express = require('express')
const router = express.Router()
const multer  = require('multer')
const path = require('path')
const {
  glob,
  globSync,
  globStream,
  globStreamSync,
  Glob,
} = require('glob')

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
    res.status(200).json({msg: `file uploaded successfully!`})
})


router.get('/get-images', async (req, res)=> {
   const imgs = await glob(['**/gallery/*.{png,jpeg,jpg,PNG,JPG}'])
   const imgPath = imgs.map((img)=> {
      return img.replace(/\\/g, '/').replace('public', '')
   })
   res.status(200).json({imgPath})
})


module.exports = router