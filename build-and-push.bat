@echo off
echo Installing dependencies...
cd frontend
call npm install
echo.
echo Building app...
call npm run build
echo.
echo Build complete! Now committing and pushing to GitHub...
cd ..
git add .
git commit -m "feat: replace AI with client-side OCR using Tesseract.js"
git push origin main
echo.
echo Done! Railway will redeploy automatically.
pause
