// Generate simple PWA icons as SVG files (browsers accept SVG for icons too)
const fs = require('fs');

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#g)"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>
  <g transform="translate(${size*0.25},${size*0.25}) scale(${size*0.5/24})">
    <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="13" r="3" fill="none" stroke="#fff" stroke-width="2"/>
  </g>
</svg>`;

// Write as SVG (universally supported)
fs.writeFileSync('icon-192.svg', svg(192));
fs.writeFileSync('icon-512.svg', svg(512));

// Also write PNG-named SVGs (Vercel serves them fine)
fs.writeFileSync('icon-192.png', svg(192));
fs.writeFileSync('icon-512.png', svg(512));

console.log('Icons generated!');
