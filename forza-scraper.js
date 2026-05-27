// ============================================================
//  FORZA.NET → CLOUDINARY AUTO-SYNC SCRIPT (v5 — SPA-Ready)
// ============================================================
//  USAGE:
//    1. Open https://forza.net/myforza in your browser
//    2. Log in with your Xbox account
//    3. Scroll down to load ALL photos (lazy loading)
//    4. Open the browser console (F12 → Console)
//    5. Paste this ENTIRE script and press Enter
//    6. It auto-loads ALL pages via hidden iframes,
//       then uploads every photo to Cloudinary.
// ============================================================

(async function forzaToCloudinary() {
  const API = "https://forza-gallery-api.onrender.com";

  console.log("%c FORZA GALLERY SYNC v5 (SPA-Ready) ", "background:#3b82f6;color:#fff;font-size:16px;padding:4px 12px;border-radius:6px;");

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

  // --- Scroll helper to trigger lazy loading ---
  async function scrollToBottom(doc, win = window) {
    const scrollHeight = () => doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
    const clientHeight = () => doc.documentElement.clientHeight || win.innerHeight || 800;

    let lastHeight = 0;
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      const currentHeight = scrollHeight();
      if (currentHeight === lastHeight) break;

      lastHeight = currentHeight;

      // Scroll down in steps
      for (let i = 0; i < 5; i++) {
        win.scrollTo(0, (currentHeight - clientHeight()) * (i + 1) / 5);
        await new Promise(r => setTimeout(r, 300));
      }

      // Final scroll to bottom
      win.scrollTo(0, currentHeight);
      await new Promise(r => setTimeout(r, 800));

      attempts++;
    }

    // Scroll back to top
    win.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));
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

  // --- Step 1: Scan current page (with scrolling for lazy loading) ---
  console.log("  Scanning current page...");
  console.log("  Waiting for page to fully render...");
  await new Promise(r => setTimeout(r, 3000));
  console.log("  Scrolling to trigger lazy loading...");
  await scrollToBottom(document);
  scanDOM(document);
  console.log(`    Page 1: ${photoUrls.length} photos`);
  console.log("  If photos appear after this line, the lazy loading worked!");

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
      await new Promise(async (resolve) => {
        const iframe = document.createElement("iframe");
        // Make iframe visible enough for lazy loading to work but hidden from view
        iframe.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0.001;pointer-events:none;z-index:-9999";
        iframe.src = href;

        const timeout = setTimeout(() => {
          console.log("    Timeout reached, removing iframe");
          iframe.remove();
          resolve();
        }, 30000);

        iframe.onload = async () => {
          try {
            const idoc = iframe.contentDocument;
            const iwin = iframe.contentWindow;

            if (!idoc || !iwin) {
              console.warn("    Couldn't access iframe content");
              clearTimeout(timeout);
              iframe.remove();
              resolve();
              return;
            }

            console.log("    Waiting for SPA to render...");
            // Wait for any initial rendering
            await new Promise(r => setTimeout(r, 3000));

            // Scroll within iframe to trigger lazy loading
            console.log("    Scrolling iframe to trigger lazy loading...");
            await scrollToBottom(idoc, iwin);

            // Scan the iframe DOM
            scanDOM(idoc);

            console.log("    Scan complete, removing iframe");
          } catch(e) {
            console.warn("    iframe error:", e.message);
          }
          clearTimeout(timeout);
          iframe.remove();
          resolve();
        };

        iframe.onerror = () => {
          console.warn("    iframe load error");
          clearTimeout(timeout);
          iframe.remove();
          resolve();
        };

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

  // --- Step 4: Check for Nuxt/Vue embedded data ---
  if (photoUrls.length <= 20) {
    console.log("  Checking for embedded app data...");
    // Nuxt payload
    try {
      const nuxt = window.__NUXT__ || window.__NUXT_DATA__;
      if (nuxt) {
        const nuxtStr = JSON.stringify(nuxt);
        const nuxtUrls = nuxtStr.match(/t10pgalleryv2[^"'\s<>)]*galleryv2images\/[^"'\s<>)]+/g) || [];
        nuxtUrls.forEach(u => addUrl("https://" + u.replace(/^https?:\/\//, "")));
        console.log(`    NUXT data: +${nuxtUrls.length} URLs found`);
      }
    } catch(e) {}

    // Scan ALL script tags for embedded JSON data
    document.querySelectorAll("script").forEach(s => {
      const txt = s.textContent || s.innerText || "";
      if (txt.includes("galleryv2images")) {
        const urls = txt.match(/t10pgalleryv2[^"'\s<>)]*galleryv2images\/[^"'\s<>)]+/g) || [];
        urls.forEach(u => addUrl("https://" + u.replace(/^https?:\/\//, "")));
        console.log(`    Script tag: +${urls.length} URLs found`);
      }
    });
    console.log(`    After data scan: ${photoUrls.length} total`);
  }

  // --- Step 5: FORCE CLICK PAGES ---
  if (photoUrls.length <= 20) {
    console.log("  FORCING PAGE NAVIGATION...");

    // Wait for pagination to exist
    let waitAttempts = 0;
    while (waitAttempts < 30) {
      const hasPagination = document.querySelector('[class*="pagination"], [class*="page"], nav, [role="navigation"]');
      const hasPage2 = [...document.querySelectorAll('*')].some(e => e.textContent?.trim() === '2');
      if (hasPagination || hasPage2) {
        console.log("  Pagination found!");
        break;
      }
      await new Promise(r => setTimeout(r, 500));
      waitAttempts++;
    }

    // Helper to find and click page
    async function forceClickPage(pageNum) {
      const pageStr = String(pageNum);

      // Find ALL elements with this text
      const allElements = [...document.querySelectorAll('*')];
      const candidates = allElements.filter(e => {
        const txt = e.childNodes[0]?.textContent?.trim() || e.textContent?.trim();
        return txt === pageStr && e.children.length <= 1;
      });

      console.log(`  Found ${candidates.length} candidates for page ${pageNum}`);

      // Try each candidate
      for (const el of candidates) {
        console.log(`    Trying: ${el.tagName} | ${el.className} | visible: ${el.offsetParent !== null}`);

        // Scroll into view
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(r => setTimeout(r, 200));

        // Multiple click attempts
        for (let i = 0; i < 3; i++) {
          // Try pointer events
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

          // Try mouse events
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

          // Try native click
          el.click();

          await new Promise(r => setTimeout(r, 100));
        }

        // Click parent if clickable
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.onclick || parent.getAttribute('role') === 'button') {
            console.log(`    Clicking parent ${parent.tagName}...`);
            parent.click();
            parent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            break;
          }
          parent = parent.parentElement;
        }

        // Wait for render
        await new Promise(r => setTimeout(r, 2000));

        // Scroll and scan
        await scrollToBottom(document);
        scanDOM(document);
      }

      return candidates.length > 0;
    }

    // Click through pages
    let consecutiveFails = 0;
    const MAX_FAILS = 2;

    for (let p = 2; p <= 10; p++) {
      const beforeCount = photoUrls.length;
      const found = await forceClickPage(p);

      if (!found) {
        console.log(`  No click candidates for page ${p}. Trying router...`);

        // FALLBACK: Try Nuxt/Vue router or direct URL change
        const baseUrl = window.location.href.split('?')[0];
        const newUrl = `${baseUrl}?page=${p}`;

        console.log(`    Navigating to: ${newUrl}`);

        // Try to use Nuxt router if available
        if (window.$nuxt && window.$nuxt.$router) {
          window.$nuxt.$router.push({ path: '/myforza', query: { page: p } });
        } else if (window.__NUXT__ && window.history) {
          // Direct URL manipulation
          window.history.pushState({}, '', newUrl);
          // Trigger popstate for SPA
          window.dispatchEvent(new PopStateEvent('popstate'));
        }

        // Wait for navigation
        await new Promise(r => setTimeout(r, 4000));
        await scrollToBottom(document);
        scanDOM(document);
      }

      const added = photoUrls.length - beforeCount;
      console.log(`    Page ${p}: +${added} photos (total: ${photoUrls.length})`);

      // Track consecutive failures
      if (added === 0) {
        consecutiveFails++;
        console.log(`    ⚠️  Consecutive fails: ${consecutiveFails}/${MAX_FAILS}`);

        if (consecutiveFails >= MAX_FAILS) {
          console.log(`    Stopping after ${MAX_FAILS} empty pages.`);
          break;
        }

        // Try longer wait before giving up on this page
        console.log(`    Retrying page ${p} with longer wait...`);
        await new Promise(r => setTimeout(r, 5000));
        await scrollToBottom(document);
        scanDOM(document);
      } else {
        consecutiveFails = 0; // Reset on success
      }
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
