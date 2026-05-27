// ============================================================
//  FORZA.NET → CLOUDINARY AUTO-SYNC SCRIPT
// ============================================================
//  USAGE:
//    1. Open https://forza.net/myforza in your browser
//    2. Log in with your Xbox account
//    3. Make sure your photos are visible on the page
//    4. Open the browser console (F12 → Console)
//    5. Paste this ENTIRE script and press Enter
//    6. It will upload every photo directly to Cloudinary
//    7. Your gallery at forza6.vercel.app updates automatically
// ============================================================

(async function forzaToCloudinary() {
  const CLOUD_NAME = "dqwnsi211";
  const UPLOAD_PRESET = "forza_unsigned"; // Must create this in Cloudinary settings

  console.log("%c FORZA GALLERY SYNC ", "background:#3b82f6;color:#fff;font-size:16px;padding:4px 12px;border-radius:6px;");
  console.log("Scanning for Forza photos on this page...\n");

  // --- Step 1: Find all gallery images ---
  // Try multiple selectors to catch images on forza.net
  const selectors = [
    'img[src*="forzamotorsport.net"]',
    'img[src*="forza.net"]',
    'img[src*="ugcorigin"]',
    'img[src*="gameclipscontent"]',
    'img[src*="xboxlive.com"]',
    'img[src*="blob:"]',
    '.gallery img',
    '[class*="gallery"] img',
    '[class*="photo"] img',
    '[class*="screenshot"] img',
  ];

  const seen = new Set();
  const images = [];

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((img) => {
      let src = img.src || img.dataset.src || img.getAttribute("data-original");
      if (!src || seen.has(src)) return;

      // Skip tiny icons, avatars, logos
      if (img.naturalWidth > 0 && img.naturalWidth < 100) return;
      if (img.naturalHeight > 0 && img.naturalHeight < 100) return;

      seen.add(src);
      images.push(src);
    });
  }

  // Also look for background images in divs
  document.querySelectorAll('[style*="background-image"]').forEach((el) => {
    const match = el.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
    if (match && match[1] && !seen.has(match[1])) {
      seen.add(match[1]);
      images.push(match[1]);
    }
  });

  if (images.length === 0) {
    console.warn("No photos found! Make sure:");
    console.warn("  1. You are logged in to forza.net");
    console.warn("  2. Your photos are visible on the page");
    console.warn("  3. Scroll down to load all photos first");
    return;
  }

  console.log(`Found ${images.length} photo(s). Starting upload to Cloudinary...\n`);

  // --- Step 2: Get existing photos from Cloudinary to skip duplicates ---
  let existingNames = new Set();
  try {
    const apiRes = await fetch("https://forza-gallery-api.onrender.com/api/photos");
    if (apiRes.ok) {
      const data = await apiRes.json();
      (data.photos || []).forEach((p) => existingNames.add(p.id));
    }
  } catch (e) {
    console.log("Could not check for duplicates (API may be sleeping). Uploading all...");
  }

  // --- Step 3: Upload each image to Cloudinary ---
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i++) {
    const src = images[i];
    const timestamp = Date.now();
    const publicId = `forza_photo_${timestamp}_${i}`;

    // Check for duplicate by URL hash
    const urlHash = src.split("?")[0].split("/").pop().split(".")[0];
    const possibleId = `forza_gallery/${urlHash}`;
    if (existingNames.has(possibleId)) {
      console.log(`  [${i + 1}/${images.length}] SKIP (already uploaded): ${urlHash}`);
      skipped++;
      continue;
    }

    try {
      // Fetch the image as a blob
      console.log(`  [${i + 1}/${images.length}] Downloading: ${src.substring(0, 80)}...`);
      const imgRes = await fetch(src);
      const blob = await imgRes.blob();

      // Upload to Cloudinary using unsigned upload
      const formData = new FormData();
      formData.append("file", blob, `${publicId}.png`);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("folder", "forza_gallery");
      formData.append("public_id", publicId);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );

      if (cloudRes.ok) {
        const result = await cloudRes.json();
        console.log(`  [${i + 1}/${images.length}] UPLOADED: ${result.secure_url}`);
        uploaded++;
      } else {
        const err = await cloudRes.text();
        console.error(`  [${i + 1}/${images.length}] UPLOAD FAILED:`, err);
        failed++;
      }
    } catch (error) {
      console.error(`  [${i + 1}/${images.length}] ERROR:`, error.message);
      failed++;
    }

    // Brief delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n%c SYNC COMPLETE ", "background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:6px;");
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`\n  View your gallery: https://forza6.vercel.app`);
})();
