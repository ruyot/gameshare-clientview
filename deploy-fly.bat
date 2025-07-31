@echo off
echo 🚀 Deploying GameShare signaling server to Fly.io...

REM Check if flyctl is installed
flyctl version >nul 2>&1
if errorlevel 1 (
    echo ❌ flyctl is not installed. Please install it first:
    echo    curl -L https://fly.io/install.sh ^| sh
    pause
    exit /b 1
)

REM Check if user is logged in
flyctl auth whoami >nul 2>&1
if errorlevel 1 (
    echo 🔐 Please log in to Fly.io:
    flyctl auth login
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Deploy to Fly.io
echo 🚀 Deploying to Fly.io...
flyctl deploy

echo ✅ Deployment complete!
echo 📊 Monitor your app with:
echo    flyctl status
echo    flyctl logs
echo    flyctl metrics
pause 