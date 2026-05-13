@echo off
rem Launch VJ Lyrics: vite dev 5173 + relay 8787, then open browser.
cd /d "%~dp0"

start "VJ Lyrics - vite"  cmd /k "npm run dev"
start "VJ Lyrics - relay" cmd /k "npm run relay"

powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:5173 -TimeoutSec 1) | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }"
start "" "http://localhost:5173"
