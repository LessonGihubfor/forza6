require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

// --- Configuration ---
const WATCH_FOLDER = process.env.WATCH_FOLDER || 'C:\\Users\\jzsha\\ForzaShots';
const CLOUDINARY_FOLDER = 'forza_gallery';
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

async function getExistingIds() {
  try {
    const result = await cloudinary.search
      .expression(`folder:${CLOUDINARY_FOLDER} AND resource_type:image`)
      .max_results(500)
      .execute();
    return new Set((result.resources || []).map((r) => r.public_id));
  } catch {
    return new Set();
  }
}

async function uploadFile(filePath, existingIds) {
  const name = path.parse(filePath).name;
  const publicId = `${CLOUDINARY_FOLDER}/${name}`;

  if (existingIds.has(publicId)) {
    console.log(`  SKIP (already uploaded): ${name}`);
    return false;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: CLOUDINARY_FOLDER,
      public_id: name,
      resource_type: 'image',
      overwrite: false,
    });
    console.log(`  UPLOADED: ${name} -> ${result.secure_url}`);
    return true;
  } catch (err) {
    console.error(`  ERROR uploading ${name}:`, err.message);
    return false;
  }
}

async function main() {
  console.log(`\n=== Forza Gallery Uploader ===`);
  console.log(`Scanning: ${WATCH_FOLDER}\n`);

  if (!fs.existsSync(WATCH_FOLDER)) {
    console.error(`Folder not found: ${WATCH_FOLDER}`);
    console.log(`Create it and save your Forza screenshots there.`);
    process.exit(1);
  }

  const files = fs.readdirSync(WATCH_FOLDER).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  if (files.length === 0) {
    console.log('No image files found in the folder.');
    console.log('Save your Forza screenshots to:', WATCH_FOLDER);
    return;
  }

  console.log(`Found ${files.length} image(s). Checking for duplicates...\n`);
  const existingIds = await getExistingIds();

  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(WATCH_FOLDER, file);
    const didUpload = await uploadFile(filePath, existingIds);
    if (didUpload) uploaded++;
    else skipped++;
  }

  console.log(`\nDone! Uploaded: ${uploaded}, Skipped: ${skipped}`);
  console.log(`View your gallery at: https://forza6.vercel.app`);
}

main().catch(console.error);
