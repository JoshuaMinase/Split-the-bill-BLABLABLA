@echo off
echo ========================================
echo Deploying OCR Update to Railway
echo ========================================
echo.

echo Step 1: Installing frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo Dependencies installed successfully!
echo.

echo Step 2: Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: npm run build failed
    pause
    exit /b 1
)
echo Build completed successfully!
echo.

echo Step 3: Committing changes to git...
cd ..
git add frontend/package.json frontend/next.config.js frontend/src/app/page.tsx frontend/src/lib/ocr-parser.ts
git add backend/.env.example backend/main.py backend/requirements.txt
git add -A
git commit -m "feat: replace AI with client-side OCR using Tesseract.js - no more API errors"
if errorlevel 1 (
    echo No changes to commit or git commit failed
)
echo.

echo Step 4: Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo ERROR: git push failed
    pause
    exit /b 1
)
echo.

echo ========================================
echo SUCCESS! Changes pushed to GitHub
echo Railway will redeploy automatically
echo ========================================
echo.
echo Your app will be updated with:
echo - Client-side OCR (no AI API errors)
echo - Works entirely in browser
echo - No API keys needed
echo - Free and unlimited usage
echo.
pause
