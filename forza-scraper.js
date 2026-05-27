// ============================================================
//  FORZA.NET → CLOUDINARY AUTO-SYNC SCRIPT (v2 — Server Proxy)
// ============================================================
//  USAGE:
//    1. Open https://forza.net/myforza in your browser
//    2. Log in with your Xbox account
//    3. Scroll down so ALL your photos are visible on the page
//    4. Open the browser console (F12 → Console)
//    5. Paste this ENTIRE script and press Enter
//    6. It sends your photo URLs to the Render backend,
//       which fetches them server-side (bypasses CORS) and
//       uploads to Cloudinary automatically.
//    7. Your gallery at forza6.vercel.app updates instantly.
// ============================================================

(async function forzaToCloudinary() {
  const API = "https://forza-gallery-api.onrender.com";

  console.log("%c FORZA GALLERY SYNC v3 ", "background:#3b82f6;color:#fff;font-size:16px;padding:4px 12px;border-radius:6px;");

  // --- Helpers ---
  const seenUUID = new Set();
  const photoUrls = [];

  function addUrl(src) {
    if (!src) return;
    if (!src.includes("t10pgalleryv2.azureedge.net/galleryv2images/")) return;
    const parts = src.split("/");
    const sizeIdx = parts.length - 1;
    const uuid = parts[parts.length - 2] || src;
    if (seenUUID.has(uuid)) return;
    seenUUID.add(uuid);
    if (parts[sizeIdx] === "2" || parts[sizeIdx] === "3") {
      parts[sizeIdx] = "4";
    }
    photoUrls.push(parts.join("/"));
  }

  function scanPage() {
    document.querySelectorAll("img").forEach(img => addUrl(img.src));
    document.querySelectorAll("[style*='background-image']").forEach(el => {
      const m = el.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
      if (m) addUrl(m[1]);
    });
    document.querySelectorAll("[data-src],[data-image],[data-photo]").forEach(el => {
      addUrl(el.dataset.src || el.dataset.image || el.dataset.photo);
    });
  }

  // --- Step 1: Scan ALL pages (SPA-aware with MutationObserver) ---
  console.log("  Scanning page 1...");
  scanPage();
  console.log(`    Found ${photoUrls.length} unique photo(s) so far`);

  // Helper: wait for new gallery images to appear in DOM after page click
  function waitForNewImages(timeoutMs = 8000) {
    return new Promise(resolve => {
      const beforeCount = photoUrls.length;
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      const observer = new MutationObserver(() => {
        scanPage();
        if (photoUrls.length > beforeCount) { observer.disconnect(); done(); }
      });
      observer.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["src", "style", "data-src"]
      });

      // Also poll every 500ms as a fallback
      const poll = setInterval(() => {
        scanPage();
        if (photoUrls.length > beforeCount) { clearInterval(poll); observer.disconnect(); done(); }
      }, 500);

      setTimeout(() => { clearInterval(poll); observer.disconnect(); done(); }, timeoutMs);
    });
  }

  // Click through pages 2, 3, 4, ... until no new photos found
  for (let nextPage = 2; nextPage <= 20; nextPage++) {
    // Find a clickable element with just this page number
    const pageLink = [...document.querySelectorAll("a, button, li, span")].find(el => {
      const txt = el.textContent.trim();
      return txt === String(nextPage) && el.offsetParent !== null && txt.length <= 2;
    });
    if (!pageLink) {
      console.log(`  No page ${nextPage} link found. Done scanning.`);
      break;
    }

    const beforeCount = photoUrls.length;
    console.log(`  Clicking page ${nextPage}...`);
    pageLink.click();

    // Wait for the SPA to render new images
    await waitForNewImages(8000);
    // Extra scan after wait
    scanPage();
    const newFound = photoUrls.length - beforeCount;
    console.log(`    +${newFound} new photo(s), ${photoUrls.length} total`);

    if (newFound === 0) {
      console.log(`    No new photos on page ${nextPage}. Stopping.`);
      break;
    }
  }

  if (photoUrls.length === 0) {
    console.warn("%c No Forza photos found! ", "background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;");
    console.warn("Make sure:");
    console.warn("  1. You are on https://forza.net/myforza");
    console.warn("  2. You are logged in");
    console.warn("  3. Scroll ALL the way down to load every photo");
    console.warn("  4. Try again after scrolling");
    return;
  }

  console.log(`%c Found ${photoUrls.length} Forza photo(s) `, "background:#22c55e;color:#fff;padding:2px 8px;border-radius:4px;");
  console.log("Sending URLs to server for upload (bypasses CORS)...\n");

  // --- Step 2: Send URLs to backend in batches of 10 ---
  const BATCH_SIZE = 10;
  let totalUploaded = 0;
  let totalFailed = 0;

  for (let i = 0; i < photoUrls.length; i += BATCH_SIZE) {
    const batch = photoUrls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(photoUrls.length / BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches}: Uploading ${batch.length} photo(s)...`);

    try {
      const res = await fetch(`${API}/api/upload-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: batch }),
      });

      if (res.ok) {
        const data = await res.json();
        totalUploaded += data.uploaded || 0;
        totalFailed += data.failed || 0;

        let batchSkipped = 0;
        (data.results || []).forEach((r) => {
          if (r.status === "uploaded") {
            console.log(`    UPLOADED: ${r.cloudinary_url}`);
          } else if (r.status === "skipped") {
            batchSkipped++;
          } else {
            console.log(`    FAILED: ${r.url.substring(0, 60)}... — ${r.error}`);
          }
        });
        if (batchSkipped > 0) console.log(`    Skipped ${batchSkipped} duplicate(s)`);
      } else {
        const errText = await res.text();
        console.error(`    Batch ${batchNum} server error:`, errText);
        totalFailed += batch.length;
      }
    } catch (err) {
      console.error(`    Batch ${batchNum} network error:`, err.message);
      totalFailed += batch.length;
    }

    // Small delay between batches
    if (i + BATCH_SIZE < photoUrls.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("\n%c SYNC COMPLETE ", "background:#22c55e;color:#fff;font-size:16px;padding:4px 12px;border-radius:6px;");
  console.log(`  Uploaded: ${totalUploaded}`);
  console.log(`  Failed:   ${totalFailed}`);
  console.log(`\n  View your gallery: https://forza6.vercel.app`);
})();
