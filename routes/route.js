const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs');
const {
  glob,
  globSync,
  globStream,
  globStreamSync,
  Glob,
} = require('glob')

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'public/gallery'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
    cb(null, `${name}_${timestamp}${ext}`);
  }
});


const upload = multer({ storage });

router.post('/upload', upload.array('photos', 12), function (req, res, next) {
  res.status(200).json({ msg: `file uploaded successfully!` })
})


// router.get('/get-images', async (req, res) => {
//   const imgs = await glob(['**/gallery/*.{png,jpeg,jpg,PNG,JPG}'])
//   const imgPath = imgs.map((img) => {
//     return img.replace(/\\/g, '/').replace('public', '')
//   })
//   res.status(200).json({ imgPath })
// })

router.get('/get-images', async (req, res) => {
  try {
    const imgs = await glob(['**/gallery/*.{png,jpeg,jpg,PNG,JPG}']);

    // Sort by file creation (birthtimeMs), fallback to mtimeMs
    imgs.sort((a, b) => {
      const aStats = fs.statSync(a);
      const bStats = fs.statSync(b);

      const aTime = aStats.birthtimeMs || aStats.mtimeMs;
      const bTime = bStats.birthtimeMs || bStats.mtimeMs;

      return bTime - aTime; 
    });

    const imgPath = imgs.map((img) =>
      img.replace(/\\/g, '/').replace('public', '')
    );

    res.status(200).json({ imgPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});


module.exports = router