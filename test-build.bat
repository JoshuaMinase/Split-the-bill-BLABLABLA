@echo off
echo Testing build locally...
cd frontend
echo Installing dependencies...
call npm install
echo.
echo Building...
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)
echo BUILD SUCCESS!
pause
