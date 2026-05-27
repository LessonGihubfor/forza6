require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Cloudinary configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// --- Middleware ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json({ limit: '50mb' }));

// --- Health check ---
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'forza-gallery-api',
    endpoints: ['/api/photos'],
  });
});

// --- Photos endpoint ---
// Fetches all images from the `forza_gallery` folder, sorted newest-first.
app.get('/api/photos', async (req, res) => {
  try {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(500).json({
        error: 'Cloudinary environment variables are not configured on the server.',
      });
    }

    const maxResults = Math.min(parseInt(req.query.max, 10) || 100, 500);

    const result = await cloudinary.search
      .expression('folder:forza_gallery AND resource_type:image')
      .sort_by('created_at', 'desc')
      .max_results(maxResults)
      .execute();

    const photos = (result.resources || []).map((r) => ({
      id: r.public_id,
      url: r.secure_url,
      thumbnail: cloudinary.url(r.public_id, {
        secure: true,
        transformation: [
          { width: 960, crop: 'scale' },
          { quality: 100 },
        ],
      }),
      full: cloudinary.url(r.public_id, {
        secure: true,
        transformation: [{ quality: 100 }],
      }),
      width: r.width,
      height: r.height,
      format: r.format,
      bytes: r.bytes,
      created_at: r.created_at,
    }));

    res.json({
      count: photos.length,
      total: result.total_count || photos.length,
      next_cursor: result.next_cursor || null,
      photos,
    });
  } catch (err) {
    console.error('Error fetching photos from Cloudinary:', err);
    res.status(500).json({
      error: 'Failed to fetch photos from Cloudinary.',
      details: err && err.message ? err.message : String(err),
    });
  }
});

// --- Proxy upload endpoint ---
// Accepts an array of image URLs, fetches them server-side (no CORS), uploads to Cloudinary.
app.post('/api/upload-urls', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Provide an array of image URLs in { urls: [...] }' });
    }

    // Cap at 50 per request to avoid timeout
    const batch = urls.slice(0, 50);
    const results = [];

    for (let url of batch) {
      try {
        // Force the /4 (full-res) version — never upload thumbnails
        const urlClean = url.split('?')[0];
        if (urlClean.match(/\/[23]$/)) {
          url = urlClean.replace(/\/[23]$/, '/4');
        }

        // Hash only the photo UUID for consistent dedup regardless of size suffix
        // URL pattern: .../galleryv2images/{userID}/{photoUUID}/{size}
        const urlParts = urlClean.split('/');
        const photoUUID = urlParts[urlParts.length - 2] || '';
        const publicId = photoUUID
          ? `fh6_${crypto.createHash('md5').update(photoUUID).digest('hex').substring(0, 12)}`
          : `fh6_${crypto.createHash('md5').update(urlClean).digest('hex').substring(0, 12)}`;

        // Check if this image already exists
        try {
          await cloudinary.api.resource(`forza_gallery/${publicId}`);
          results.push({ url, status: 'skipped', reason: 'already exists' });
          console.log(`Skipped (duplicate): ${publicId}`);
          continue;
        } catch (checkErr) {
          // Resource not found = good, upload it
        }

        const uploadResult = await cloudinary.uploader.upload(url, {
          folder: 'forza_gallery',
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          unique_filename: false,
        });
        results.push({ url, status: 'uploaded', cloudinary_url: uploadResult.secure_url });
        console.log(`Uploaded: ${uploadResult.secure_url}`);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error(`Failed to upload ${url}: ${msg}`);
        results.push({ url, status: 'failed', error: msg });
      }
    }

    const uploaded = results.filter((r) => r.status === 'uploaded').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    res.json({ uploaded, failed, total: batch.length, results });
  } catch (err) {
    console.error('Error in /api/upload-urls:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Forza gallery API listening on port ${PORT}`);
});
