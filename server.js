const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Paths ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const METADATA_FILE = path.join(__dirname, 'photos.json');

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}
ensureUploadsDir();

// --- Middleware ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json({ limit: '50mb' }));

// Serve uploaded images statically
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Helper: Download image from URL ---
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(destPath);
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', reject);
  });
}

// --- Helper: Load metadata ---
async function loadMetadata() {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// --- Helper: Save metadata ---
async function saveMetadata(photos) {
  await fs.writeFile(METADATA_FILE, JSON.stringify(photos, null, 2));
}

// --- Health check ---
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'forza-gallery-api (LOCAL STORAGE)',
    endpoints: ['/api/photos', '/api/upload-urls'],
    storage: 'Local files - NO COMPRESSION',
  });
});

// --- Photos endpoint ---
app.get('/api/photos', async (req, res) => {
  try {
    const maxResults = Math.min(parseInt(req.query.max, 10) || 100, 500);
    const photos = await loadMetadata();
    
    // Sort by created_at desc
    const sorted = photos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const limited = sorted.slice(0, maxResults);
    
    // Add full URLs
    const withUrls = limited.map(p => ({
      ...p,
      url: `${req.protocol}://${req.get('host')}/uploads/${p.filename}`,
      thumbnail: `${req.protocol}://${req.get('host')}/uploads/${p.filename}`,
      full: `${req.protocol}://${req.get('host')}/uploads/${p.filename}`,
    }));

    res.json({
      count: withUrls.length,
      total: photos.length,
      photos: withUrls,
    });
  } catch (err) {
    console.error('Error fetching photos:', err);
    res.status(500).json({
      error: 'Failed to fetch photos.',
      details: err && err.message ? err.message : String(err),
    });
  }
});

// --- Upload endpoint ---
app.post('/api/upload-urls', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Provide an array of image URLs in { urls: [...] }' });
    }

    const batch = urls.slice(0, 50);
    const results = [];
    const existingPhotos = await loadMetadata();

    for (let url of batch) {
      try {
        // Force the /4 (full-res) version
        const urlClean = url.split('?')[0];
        if (urlClean.match(/\/[23]$/)) {
          url = urlClean.replace(/\/[23]$/, '/4');
        }

        // Generate unique filename from UUID
        const urlParts = urlClean.split('/');
        const photoUUID = urlParts[urlParts.length - 2] || '';
        const hash = crypto.createHash('md5').update(photoUUID).digest('hex').substring(0, 12);
        const filename = `fh6_${hash}.jpg`;
        const filepath = path.join(UPLOADS_DIR, filename);

        // Check if already exists
        const exists = existingPhotos.find(p => p.id === hash);
        if (exists && !req.query.force) {
          console.log(`Skipping (exists): ${filename}`);
          results.push({ url, status: 'skipped', reason: 'already exists' });
          continue;
        }

        console.log(`Downloading ${url} (${url.includes('/4') ? 'FULL RES' : 'LOW RES!'})`);

        // Download the image
        await downloadImage(url, filepath);

        // Get file stats
        const stats = await fs.stat(filepath);
        
        // Add to metadata
        const photoData = {
          id: hash,
          filename,
          original_url: url,
          size: stats.size,
          created_at: new Date().toISOString(),
        };

        // Remove old entry if exists
        const filtered = existingPhotos.filter(p => p.id !== hash);
        filtered.push(photoData);
        await saveMetadata(filtered);

        results.push({ 
          url, 
          status: 'uploaded', 
          local_url: `/uploads/${filename}`,
          size: stats.size 
        });
        console.log(`Saved: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error(`Failed to download ${url}: ${msg}`);
        results.push({ url, status: 'failed', error: msg });
      }
    }

    const uploaded = results.filter((r) => r.status === 'uploaded').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    res.json({ uploaded, failed, skipped, total: batch.length, results });
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
  console.log(`Storage: LOCAL FILES in ${UPLOADS_DIR} - ZERO COMPRESSION`);
});
