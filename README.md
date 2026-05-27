# Forza Gallery

Sync Forza Motorsport 6 PC screenshots to a mobile-friendly web gallery via Cloudinary, then save them straight to your iPhone camera roll.

## Files
- `package.json` — backend dependencies
- `server.js` — Node/Express API
- `index.html` — mobile gallery frontend
- `.env.example` — environment variable template
- `forza-scraper.js` — browser console script to extract photos from forza.net

## Usage

1. Open https://forza.net/myforza and log in
2. Scroll down to load all photos (triggers lazy loading)
3. Open browser console (F12)
4. Copy/paste entire `forza-scraper.js` contents
5. Press Enter to sync all photos to Cloudinary

View your gallery at: https://forza6.vercel.app
