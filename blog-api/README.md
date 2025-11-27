# Blog API - Node.js Express MySQL2

A complete RESTful API for managing blog posts with image upload functionality using Express.js, MySQL2, and Multer.

## Features

- ✅ Create, Read, Update, Delete (CRUD) operations for blogs
- ✅ Image upload with Multer
- ✅ MySQL2 database with connection pooling
- ✅ Pagination support
- ✅ Search functionality
- ✅ Error handling and validation
- ✅ CORS enabled
- ✅ Environment variables configuration

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MySQL2** - Database with promise support
- **Multer** - File upload middleware
- **dotenv** - Environment configuration
- **body-parser** - Request body parsing
- **cors** - Cross-origin resource sharing

## Installation

### 1. Clone or navigate to the project directory

```bash
cd blog-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Update `.env` file with your database credentials:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=blog_db
DB_PORT=3306

MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### 4. Initialize the database

This will create the database, tables, and insert sample data:

```bash
npm run init-db
```

### 5. Start the server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server will run on: `http://localhost:5000`

## API Endpoints

### Base URL
```
http://localhost:5000/api
```

### 1. Create Blog

**Endpoint:** `POST /api/blogs`

**Content-Type:** `multipart/form-data`

**Body Parameters:**
- `title` (string, required) - Blog title
- `author` (string, required) - Author name
- `content` (string, required) - Blog content (HTML)
- `read_time` (string, optional) - Reading time (e.g., "5 min read")
- `cover_image` (file, optional) - Cover image file

**Example using cURL:**
```bash
curl -X POST http://localhost:5000/api/blogs \
  -F "title=My First Blog" \
  -F "author=John Doe" \
  -F "content=<h2>Hello World</h2><p>This is my first blog post.</p>" \
  -F "read_time=5 min read" \
  -F "cover_image=@/path/to/image.jpg"
```

**Example using Postman:**
1. Select POST method
2. URL: `http://localhost:5000/api/blogs`
3. Go to Body tab → form-data
4. Add fields: title, author, content, read_time
5. For cover_image: Select "File" type and choose image

**Response:**
```json
{
  "success": true,
  "message": "Blog created successfully",
  "data": {
    "id": 1,
    "title": "My First Blog",
    "cover_image": "/uploads/image-1234567890.jpg",
    "author": "John Doe",
    "read_time": "5 min read",
    "content": "<h2>Hello World</h2><p>This is my first blog post.</p>",
    "created_at": "2025-11-25T10:30:00.000Z",
    "updated_at": "2025-11-25T10:30:00.000Z"
  }
}
```

### 2. Get All Blogs (with pagination)

**Endpoint:** `GET /api/blogs?page=1&limit=10`

**Query Parameters:**
- `page` (number, optional, default: 1) - Page number
- `limit` (number, optional, default: 10) - Items per page

**Example:**
```bash
curl http://localhost:5000/api/blogs?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Blog Title",
      "cover_image": "/uploads/image.jpg",
      "author": "John Doe",
      "read_time": "5 min read",
      "excerpt": "First 200 characters of content...",
      "created_at": "2025-11-25T10:30:00.000Z",
      "updated_at": "2025-11-25T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### 3. Get Single Blog by ID

**Endpoint:** `GET /api/blogs/:id`

**Example:**
```bash
curl http://localhost:5000/api/blogs/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Blog Title",
    "cover_image": "/uploads/image.jpg",
    "author": "John Doe",
    "read_time": "5 min read",
    "content": "<h2>Full content here</h2><p>Complete blog content...</p>",
    "created_at": "2025-11-25T10:30:00.000Z",
    "updated_at": "2025-11-25T10:30:00.000Z"
  }
}
```

### 4. Update Blog

**Endpoint:** `PUT /api/blogs/:id`

**Content-Type:** `multipart/form-data`

**Body Parameters:** (All optional, include only fields to update)
- `title` (string)
- `author` (string)
- `content` (string)
- `read_time` (string)
- `cover_image` (file)

**Example:**
```bash
curl -X PUT http://localhost:5000/api/blogs/1 \
  -F "title=Updated Blog Title" \
  -F "content=<p>Updated content</p>"
```

**Response:**
```json
{
  "success": true,
  "message": "Blog updated successfully",
  "data": {
    "id": 1,
    "title": "Updated Blog Title",
    "cover_image": "/uploads/image.jpg",
    "author": "John Doe",
    "read_time": "5 min read",
    "content": "<p>Updated content</p>",
    "created_at": "2025-11-25T10:30:00.000Z",
    "updated_at": "2025-11-25T11:45:00.000Z"
  }
}
```

### 5. Delete Blog

**Endpoint:** `DELETE /api/blogs/:id`

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/blogs/1
```

**Response:**
```json
{
  "success": true,
  "message": "Blog deleted successfully"
}
```

### 6. Search Blogs

**Endpoint:** `GET /api/blogs/search?q=keyword&page=1&limit=10`

**Query Parameters:**
- `q` (string, required) - Search query
- `page` (number, optional, default: 1)
- `limit` (number, optional, default: 10)

**Example:**
```bash
curl "http://localhost:5000/api/blogs/search?q=javascript&page=1&limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "title": "JavaScript Best Practices",
      "cover_image": "/uploads/image.jpg",
      "author": "Jane Smith",
      "read_time": "7 min read",
      "excerpt": "Learn about JavaScript...",
      "created_at": "2025-11-25T09:00:00.000Z",
      "updated_at": "2025-11-25T09:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

### 7. Health Check

**Endpoint:** `GET /api/health`

**Example:**
```bash
curl http://localhost:5000/api/health
```

**Response:**
```json
{
  "success": true,
  "message": "Blog API is running",
  "timestamp": "2025-11-25T10:30:00.000Z"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Title, author, and content are required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Blog not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to create blog",
  "error": "Error details"
}
```

## File Upload

- **Allowed formats:** JPEG, JPG, PNG, GIF, WEBP
- **Max file size:** 5MB (configurable in .env)
- **Upload directory:** `./uploads`
- **File naming:** `originalname-timestamp-random.ext`

## Database Schema

### Blogs Table

```sql
CREATE TABLE blogs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  cover_image VARCHAR(500),
  author VARCHAR(100) NOT NULL,
  read_time VARCHAR(50),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_author (author),
  INDEX idx_created_at (created_at)
);
```

## Project Structure

```
blog-api/
├── config/
│   ├── database.js       # Database connection
│   ├── initDb.js         # Database initialization
│   └── multer.js         # File upload configuration
├── controllers/
│   └── blogController.js # Blog business logic
├── models/
│   └── Blog.js           # Blog model
├── routes/
│   └── blogRoutes.js     # API routes
├── uploads/              # Uploaded files directory
├── .env                  # Environment variables
├── .gitignore
├── package.json
├── server.js             # Main application file
└── README.md
```

## Development Tips

### Using Postman

1. Import the endpoints as a collection
2. Set base URL as variable: `{{baseURL}} = http://localhost:5000/api`
3. For file uploads, use form-data body type
4. Select "File" type for cover_image field

### Testing with cURL

**Create blog with image:**
```bash
curl -X POST http://localhost:5000/api/blogs \
  -F "title=Test Blog" \
  -F "author=Test Author" \
  -F "content=<p>Test content</p>" \
  -F "cover_image=@./test-image.jpg"
```

**Update blog:**
```bash
curl -X PUT http://localhost:5000/api/blogs/1 \
  -F "title=Updated Title"
```

**Delete blog:**
```bash
curl -X DELETE http://localhost:5000/api/blogs/1
```

## Troubleshooting

### Database Connection Issues

1. Verify MySQL is running
2. Check credentials in `.env`
3. Ensure database exists (run `npm run init-db`)

### File Upload Issues

1. Check upload directory permissions
2. Verify MAX_FILE_SIZE in `.env`
3. Ensure file format is allowed (jpg, png, gif, webp)

### Port Already in Use

Change PORT in `.env` or kill the process:
```bash
# Find process
lsof -i :5000

# Kill process
kill -9 <PID>
```

## License

ISC

## Author

Your Name

## Contributing

Pull requests are welcome. For major changes, please open an issue first.
