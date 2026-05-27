// ============================================================
//  FORZA.NET → CLOUDINARY AUTO-SYNC SCRIPT (v4 — Full Auto)
// ============================================================
//  USAGE:
//    1. Open https://forza.net/myforza in your browser
//    2. Log in with your Xbox account
//    3. Open the browser console (F12 → Console)
//    4. Paste this ENTIRE script and press Enter
//    5. It auto-loads ALL pages via hidden iframes,
//       then uploads every photo to Cloudinary.
// ============================================================

(async function forzaToCloudinary() {
  const API = "https://forza-gallery-api.onrender.com";

  console.log("%c FORZA GALLERY SYNC v4 (FULL AUTO) ", "background:#3b82f6;color:#fff;font-size:16px;padding:4px 12px;border-radius:6px;");

  // --- Helpers ---
  const seenUUID = new Set();
  const photoUrls = [];

  function addUrl(src) {
    if (!src) return;
    // Clean query strings
    src = src.split("?")[0].split("#")[0];
    if (!src.includes("t10pgalleryv2.azureedge.net") && !src.includes("galleryv2images")) return;
    // Extract UUID: URL pattern .../galleryv2images/{userID}/{photoUUID}/{size}
    const parts = src.split("/");
    // Find the "galleryv2images" segment to anchor our parsing
    const gIdx = parts.indexOf("galleryv2images");
    if (gIdx === -1 || gIdx + 3 > parts.length - 1) return;
    const uuid = parts[gIdx + 2]; // photoUUID
    const size = parts[gIdx + 3]; // size (2,3,4)
    if (!uuid || uuid.length < 8) return;
    if (seenUUID.has(uuid)) return;
    seenUUID.add(uuid);
    // Force /4 (highest res)
    parts[gIdx + 3] = "4";
    photoUrls.push(parts.join("/"));
  }

  function scanDOM(doc) {
    doc.querySelectorAll("img").forEach(img => {
      addUrl(img.src);
      addUrl(img.getAttribute("data-src"));
      addUrl(img.getAttribute("srcset"));
    });
    doc.querySelectorAll("[style*='background']").forEach(el => {
      const m = (el.getAttribute("style") || el.style.cssText || "").match(/url\(["']?(.+?)["']?\)/g);
      if (m) m.forEach(u => addUrl(u.replace(/url\(["']?|["']?\)/g, "")));
    });
    // Brute-force: regex scan entire HTML
    const html = doc.documentElement.innerHTML;
    const matches = html.match(/t10pgalleryv2[^"'\s<>)]+galleryv2images\/[^"'\s<>)]+/g) || [];
    matches.forEach(u => addUrl("https://" + u.replace(/^https?:\/\//, "")));
  }

  // --- Step 1: Scan current page ---
  console.log("  Scanning current page...");
  scanDOM(document);
  console.log(`    Page 1: ${photoUrls.length} photos`);

  // --- Step 2: Find all pagination links ---
  const pageHrefs = new Set();
  document.querySelectorAll("a[href]").forEach(a => {
    const href = a.href;
    const rawHref = a.getAttribute("href");
    if (rawHref && (rawHref.includes("page") || rawHref.includes("/myforza")) && a.textContent.trim().match(/^\d+$/)) {
      const num = parseInt(a.textContent.trim());
      if (num >= 2) pageHrefs.add(href);
    }
  });

  // If no pagination links found, try brute-force URL patterns
  if (pageHrefs.size === 0) {
    console.log("  No pagination links found, trying URL patterns...");
    const base = window.location.href.split("?")[0].split("#")[0];
    for (let p = 2; p <= 10; p++) {
      pageHrefs.add(`${base}?page=${p}`);
    }
  }

  console.log(`  Found ${pageHrefs.size} additional page(s) to scan`);

  // --- Step 3: Load each page in a hidden iframe (same-origin = full DOM access) ---
  for (const href of pageHrefs) {
    const beforeCount = photoUrls.length;
    console.log(`  Loading: ${href}`);
    try {
      await new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
        iframe.src = href;

        const timeout = setTimeout(() => { iframe.remove(); resolve(); }, 15000);

        iframe.onload = () => {
          // Wait extra time for SPA to render images
          setTimeout(() => {
            try {
              scanDOM(iframe.contentDocument);
            } catch(e) {
              console.warn("    Couldn't access iframe DOM:", e.message);
              // Fallback: try to get the HTML via fetch
            }
            clearTimeout(timeout);
            iframe.remove();
            resolve();
          }, 4000);
        };
        iframe.onerror = () => { clearTimeout(timeout); iframe.remove(); resolve(); };
        document.body.appendChild(iframe);
      });
    } catch(e) {
      console.warn("    iframe error:", e.message);
    }

    const newCount = photoUrls.length - beforeCount;
    console.log(`    +${newCount} new photos (${photoUrls.length} total)`);

    // If iframe didn't work, no point continuing with iframes
    if (newCount === 0 && photoUrls.length <= 20) {
      console.log("  Iframe didn't find new photos. Trying XHR intercept...");
      break;
    }
  }

  // --- Step 4: If still only page 1, try intercepting network + clicking ---
  if (photoUrls.length <= 20) {
    console.log("  Trying click + network intercept approach...");
    const intercepted = [];
    const _origFetch = window.fetch;
    window.fetch = async function(...args) {
      const resp = await _origFetch.apply(this, args);
      try {
        const clone = resp.clone();
        const text = await clone.text();
        const urls = text.match(/t10pgalleryv2[^"'\s<>)]*galleryv2images\/[^"'\s<>)]+/g) || [];
        urls.forEach(u => intercepted.push("https://" + u.replace(/^https?:\/\//, "")));
      } catch(e) {}
      return resp;
    };

    // Click each page number
    for (let p = 2; p <= 10; p++) {
      const el = [...document.querySelectorAll("a")].find(a => a.textContent.trim() === String(p));
      if (!el) break;
      console.log(`  Clicking page ${p}...`);
      el.click();
      await new Promise(r => setTimeout(r, 4000));

      // Scan DOM after click
      scanDOM(document);

      // Also add any intercepted URLs
      intercepted.forEach(u => addUrl(u));
      intercepted.length = 0;

      console.log(`    ${photoUrls.length} total photos`);
    }

    window.fetch = _origFetch; // restore
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
