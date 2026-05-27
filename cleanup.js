require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

(async () => {
  console.log("Scanning forza_gallery for junk uploads (SVGs, logos)...\n");

  const result = await cloudinary.search
    .expression('folder:forza_gallery AND resource_type:image')
    .max_results(100)
    .execute();

  const junk = (result.resources || []).filter((r) => {
    return (
      r.format === 'svg' ||
      r.width < 200 ||
      r.height < 200 ||
      (r.public_id && r.public_id.includes('logo')) ||
      (r.public_id && r.public_id.includes('icon')) ||
      (r.public_id && r.public_id.includes('Glyph'))
    );
  });

  if (junk.length === 0) {
    console.log("No junk found. All clean!");
    return;
  }

  console.log(`Found ${junk.length} junk file(s) to delete:\n`);
  for (const r of junk) {
    console.log(`  Deleting: ${r.public_id} (${r.format}, ${r.width}x${r.height})`);
    await cloudinary.uploader.destroy(r.public_id);
  }
  console.log(`\nDone! Removed ${junk.length} junk file(s).`);
})().catch(console.error);
