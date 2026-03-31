@echo off
title NEXUM ECOSYSTEM - BOOTSTRAP
color 0A

echo 🚀 Starting NEXUM Supreme v1.0...
echo ----------------------------------------

:: 1. Check if Node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    pause
    exit
)

:: 2. Check for .env
if not exist .env (
    echo [WARN] .env not found. Copying from example...
    copy .env.example .env
    echo [ACTION] Please fill in your API keys in .env and restart.
    pause
    exit
)

:: 3. Run Integrity Check
echo [*] Verifying system integrity...
npx ts-node src/integrity_check.ts

:: 4. Start Local Backend (Development Mode)
echo [*] Launching NEXUM Cloud Bridge...
start cmd /k "npm run dev"

:: 5. Instruction for Agent
echo ----------------------------------------
echo ✅ BACKEND IS BOOTING UP.
echo.
echo [NEXT STEP]:
echo 1. Open Telegram: /link_pc
echo 2. Run Python Agent:
echo    cd pc_agent ^&^& python nexum_agent.py --token YOUR_TOKEN
echo.
echo [PORTAL]:
echo Open http://localhost:3000/app/agent
echo ----------------------------------------
pause
