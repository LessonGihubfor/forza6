@echo off
REM ============================================================
REM  FORZA GALLERY AUTO-SYNC
REM  Double-click this file to open forza.net and copy the
REM  sync script to your clipboard automatically.
REM  Then just paste (Ctrl+V) into the browser console (F12).
REM ============================================================

echo.
echo  ========================================
echo   FORZA GALLERY AUTO-SYNC
echo  ========================================
echo.
echo  1. Browser will open to forza.net/myforza
echo  2. Log in if needed
echo  3. Scroll ALL the way down to load photos
echo  4. Press F12 to open Console
echo  5. Press Ctrl+V to paste the sync script
echo  6. Press Enter to run it
echo.

REM Copy the scraper script to clipboard
type "%~dp0forza-scraper.js" | clip

echo  [DONE] Sync script copied to clipboard!
echo.

REM Open forza.net
start https://forza.net/myforza

echo  Browser opened. Paste the script in console (Ctrl+V).
echo.
pause
