# Gallery API Documentation

This document describes the API endpoints for managing the gallery in the Green School International backend.

## Base URLs

- **Database Gallery API:** `/v1`
- **File System Gallery API:** `/api`

---

## Database Gallery API (`/v1`)

These endpoints interact with the database and manage gallery metadata (captions, image URLs).

### 1. Create Gallery Item

Creates a new item in the gallery.

- **URL:** `/v1/gallery/create`
- **Method:** `POST`

#### Request Body (JSON)

| Field         | Type     | Required | Description                     |
| :------------ | :------- | :------- | :------------------------------ |
| `image`       | `string` | **Yes**  | URL or filename of the image.   |
| `caption`     | `string` | No       | Caption text for the image.     |
| `sub_caption` | `string` | No       | Sub-caption text for the image. |

**Example:**

```json
{
  "image": "http://example.com/gallery/image.jpg",
  "caption": "School Annual Day",
  "sub_caption": "Held on December 2025"
}
```

### 2. Get All Gallery Items

Retrieves a paginated list of gallery items from the database.

- **URL:** `/v1/gallery/readAll`
- **Method:** `GET`

#### Query Parameters

| Parameter | Type     | Default | Description                  |
| :-------- | :------- | :------ | :--------------------------- |
| `page`    | `number` | `1`     | The page number to retrieve. |
| `limit`   | `number` | `12`    | Number of items per page.    |

### 3. Get Single Gallery Item

Retrieves a specific gallery item by its ID.

- **URL:** `/v1/gallery/readOne/:id`
- **Method:** `GET`

#### URL Parameters

| Parameter | Type            | Required | Description                        |
| :-------- | :-------------- | :------- | :--------------------------------- |
| `id`      | `number/string` | **Yes**  | The unique ID of the gallery item. |

### 4. Update Gallery Item

Updates an existing gallery item metadata.

- **URL:** `/v1/gallery/update/:id`
- **Method:** `PUT`

#### URL Parameters

| Parameter | Type            | Required | Description                        |
| :-------- | :-------------- | :------- | :--------------------------------- |
| `id`      | `number/string` | **Yes**  | The unique ID of the gallery item. |

#### Request Body (JSON)

| Field         | Type     | Required | Description                           |
| :------------ | :------- | :------- | :------------------------------------ |
| `image`       | `string` | No       | Updated URL or filename of the image. |
| `caption`     | `string` | No       | Updated caption text.                 |
| `sub_caption` | `string` | No       | Updated sub-caption text.             |

### 5. Delete Gallery Item

Removes a gallery item from the database.

- **URL:** `/v1/gallery/delete/:id`
- **Method:** `DELETE`

#### URL Parameters

| Parameter | Type            | Required | Description                        |
| :-------- | :-------------- | :------- | :--------------------------------- |
| `id`      | `number/string` | **Yes**  | The unique ID of the gallery item. |

### 6. Upload Gallery Image

Uploads a physical image file to the server and returns the URL.

- **URL:** `/v1/gallery/image`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

#### Request Body (Form Data)

| Field           | Type   | Required | Description                    |
| :-------------- | :----- | :------- | :----------------------------- |
| `gallery_image` | `file` | **Yes**  | The image file to be uploaded. |

### 7. Create Gallery Item (Integrated)

Uploads an image and creates a gallery entry in one request.

- **URL:** `/v1/gallery/add`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

#### Request Body (Form Data)

| Field           | Type     | Required | Description                     |
| :-------------- | :------- | :------- | :------------------------------ |
| `gallery_image` | `file`   | **Yes**  | The image file to be uploaded.  |
| `caption`       | `string` | No       | Caption text for the image.     |
| `sub_caption`   | `string` | No       | Sub-caption text for the image. |

---

## File System Gallery API (`/api`)

These endpoints interact directly with the file system in the `public/gallery` directory.

### 1. Batch Upload Photos

Uploads multiple photos to the gallery directory.

- **URL:** `/api/upload`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

#### Request Body (Form Data)

| Field    | Type     | Required | Description                    |
| :------- | :------- | :------- | :----------------------------- |
| `photos` | `file[]` | **Yes**  | Array of image files (max 12). |

### 2. Get All Image Paths

Retrieves a list of all image paths from the `public/gallery` directory, sorted by creation date (newest first).

- **URL:** `/api/get-images`
- **Method:** `GET`

#### Response

- **Success (200 OK):**
  ```json
  {
    "imgPath": ["/gallery/image1_timestamp.jpg", "/gallery/image2_timestamp.jpg"]
  }
  ```
