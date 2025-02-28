const express = require('express');
const path = require('path');
const ejs = require('ejs')
const cors = require('cors')

const routes = require('./routes/route')
const pageRoutes = require('./routes/pages')

const app = express();
const port = 3000;

app.use(cors())
app.use(express.urlencoded({extended: true}))
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', __dirname + '/view')
app.set('view engine', ejs)
// app.use(cookieParser());

app.use('/api', routes)
app.use('/', pageRoutes)

app.get('/apiv1', (req, res) => {
  res.json({
    message: 'Hello from the API!'
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
