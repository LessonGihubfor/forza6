require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

(async () => {
  console.log("Fetching all images from forza_gallery...\n");

  const result = await cloudinary.search
    .expression('folder:forza_gallery')
    .sort_by('created_at', 'asc')
    .max_results(200)
    .execute();

  const all = result.resources || [];
  console.log(`Total images: ${all.length}\n`);

  // Keep only 1920x1080 images, and only one per unique file size (bytes)
  const keepSet = new Map(); // bytes -> public_id (first 1920x1080 wins)
  const toDelete = [];

  for (const img of all) {
    if (img.width === 1920 && img.height === 1080) {
      if (!keepSet.has(img.bytes)) {
        keepSet.set(img.bytes, img.public_id);
      } else {
        // Duplicate full-res (same bytes = same image)
        toDelete.push(img.public_id);
      }
    } else {
      // Thumbnail (416x234) or avatar (208x208) - delete
      toDelete.push(img.public_id);
    }
  }

  console.log(`Keeping: ${keepSet.size} unique 1920x1080 photos`);
  console.log(`Deleting: ${toDelete.length} duplicates/thumbnails\n`);

  // Delete in batches of 10
  for (let i = 0; i < toDelete.length; i += 10) {
    const batch = toDelete.slice(i, i + 10);
    console.log(`Deleting batch ${Math.floor(i/10)+1}/${Math.ceil(toDelete.length/10)}...`);
    await cloudinary.api.delete_resources(batch);
  }

  console.log(`\nDone! ${keepSet.size} clean photos remain.`);
})().catch(console.error);
