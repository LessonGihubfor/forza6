require('dotenv').config();

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { v2: cloudinary } = require('cloudinary');

// --- Configuration ---
const WATCH_FOLDER = process.env.WATCH_FOLDER || 'C:\\Users\\jzsha\\ForzaShots';
const CLOUDINARY_FOLDER = 'forza_gallery';
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff'];
const UPLOAD_DELAY_MS = 2000; // Wait for file to finish writing

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadQueue = new Map();

function isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

async function uploadFile(filePath) {
  const name = path.parse(filePath).name;

  try {
    // Wait for file to finish writing
    let lastSize = 0;
    let stable = false;
    for (let i = 0; i < 10; i++) {
      const stat = fs.statSync(filePath);
      if (stat.size === lastSize && stat.size > 0) {
        stable = true;
        break;
      }
      lastSize = stat.size;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!stable) {
      console.log(`  WARN: File may still be writing: ${name}`);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: CLOUDINARY_FOLDER,
      public_id: name,
      resource_type: 'image',
      overwrite: false,
    });

    const now = new Date().toLocaleTimeString();
    console.log(`  [${now}] UPLOADED: ${name}`);
    console.log(`           URL: ${result.secure_url}`);
    return true;
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log(`  SKIP (already exists): ${name}`);
    } else {
      console.error(`  ERROR uploading ${name}:`, err.message);
    }
    return false;
  }
}

function scheduleUpload(filePath) {
  if (!isSupported(filePath)) return;

  // Debounce: cancel previous timer for same file
  if (uploadQueue.has(filePath)) {
    clearTimeout(uploadQueue.get(filePath));
  }

  uploadQueue.set(
    filePath,
    setTimeout(async () => {
      uploadQueue.delete(filePath);
      await uploadFile(filePath);
    }, UPLOAD_DELAY_MS)
  );
}

async function uploadExisting() {
  if (!fs.existsSync(WATCH_FOLDER)) {
    fs.mkdirSync(WATCH_FOLDER, { recursive: true });
    console.log(`Created watch folder: ${WATCH_FOLDER}`);
    return 0;
  }

  const files = fs.readdirSync(WATCH_FOLDER).filter((f) => isSupported(f));
  if (files.length === 0) return 0;

  console.log(`Found ${files.length} existing image(s), uploading...\n`);

  let uploaded = 0;
  for (const file of files) {
    const didUpload = await uploadFile(path.join(WATCH_FOLDER, file));
    if (didUpload) uploaded++;
  }
  return uploaded;
}

async function main() {
  console.log('');
  console.log('============================================');
  console.log('   FORZA GALLERY — AUTO UPLOADER');
  console.log('============================================');
  console.log(`Watching: ${WATCH_FOLDER}`);
  console.log(`Target:   Cloudinary/${CLOUDINARY_FOLDER}`);
  console.log('');
  console.log('Save any image to the watch folder and it');
  console.log('will be automatically uploaded to your gallery.');
  console.log('');
  console.log('Press Ctrl+C to stop.');
  console.log('--------------------------------------------');
  console.log('');

  // Upload any existing files first
  const existing = await uploadExisting();
  if (existing > 0) {
    console.log(`\nUploaded ${existing} existing file(s).\n`);
  }

  // Watch for new files
  const watcher = chokidar.watch(WATCH_FOLDER, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher
    .on('add', (filePath) => {
      const name = path.basename(filePath);
      const now = new Date().toLocaleTimeString();
      console.log(`  [${now}] New file detected: ${name}`);
      scheduleUpload(filePath);
    })
    .on('change', (filePath) => {
      scheduleUpload(filePath);
    })
    .on('error', (err) => {
      console.error('Watcher error:', err);
    });

  console.log('Watcher is running. Waiting for new screenshots...\n');
}

main().catch(console.error);
