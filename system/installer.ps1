# NEXUM v1.0 - Global Installer
Write-Host "🚀 Starting NEXUM Installation..." -ForegroundColor Cyan

# 1. Install Node dependencies
Write-Host "[*] Installing Backend & Portal dependencies..."
npm install

# 2. Setup Database
Write-Host "[*] Initializing Database..."
if (!(Test-Path "./data")) { New-Item -ItemType Directory -Path "./data" }

# 3. Install Python Agent dependencies
Write-Host "[*] Setting up PC Agent (Python)..."
pip install -r pc_agent/requirements.txt
playwright install chromium

# 4. Build Desktop Browser
Write-Host "[*] Building Desktop Browser (Electron)..."
cd apps/browser
npm install
cd ../..

Write-Host "✅ NEXUM v1.0 INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "Use 'npm run dev' to start the ecosystem." -ForegroundColor Yellow
