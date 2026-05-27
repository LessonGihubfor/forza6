// DEBUG SCRIPT - Run this in console on forza.net/myforza
// This will show you what image URLs are actually on the page

console.log("=== FORZA IMAGE URL DEBUG ===\n");

// Get all images
const allImages = [...document.querySelectorAll('img')];
console.log(`Found ${allImages.length} total images`);

// Check src patterns
const srcPatterns = new Map();
allImages.forEach(img => {
  const src = img.src || '';
  if (src) {
    // Extract domain pattern
    const match = src.match(/https?:\/\/([^\/]+)/);
    const domain = match ? match[1] : 'no-domain';
    srcPatterns.set(domain, (srcPatterns.get(domain) || 0) + 1);
  }
});

console.log("\n=== DOMAINS FOUND ===");
srcPatterns.forEach((count, domain) => {
  console.log(`${domain}: ${count} images`);
});

// Look for gallery-specific images
console.log("\n=== GALLERY IMAGES (detailed) ===");
allImages.forEach(img => {
  const src = img.src || '';
  if (src.includes('gallery') || src.includes('forza') || src.includes('xbox') || src.includes('azure')) {
    console.log(src);
  }
});

// Check for data attributes
console.log("\n=== DATA ATTRIBUTES ===");
const withDataSrc = allImages.filter(img => img.getAttribute('data-src'));
const withSrcset = allImages.filter(img => img.getAttribute('srcset'));
console.log(`Images with data-src: ${withDataSrc.length}`);
console.log(`Images with srcset: ${withSrcset.length}`);

if (withDataSrc.length > 0) {
  console.log("\nSample data-src URLs:");
  withDataSrc.slice(0, 3).forEach(img => console.log(img.getAttribute('data-src')));
}

// Full HTML search
console.log("\n=== REGEX SEARCH (entire page) ===");
const html = document.documentElement.innerHTML;
const matches = html.match(/https?:\/\/[^"'\s<>]+gallery[^"'\s<>]*/gi) || [];
console.log(`Found ${matches.length} gallery-related URLs in HTML`);
matches.slice(0, 5).forEach(url => console.log(url));

console.log("\n=== END DEBUG ===");
