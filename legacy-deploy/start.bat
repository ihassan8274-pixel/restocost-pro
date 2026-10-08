@echo off
setlocal
title RestoCost ERP Pro - Start
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install from https://nodejs.org and retry.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [WARN] Dependencies missing. Installing...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] Failed to install dependencies. Run setup.bat first.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [WARN] App not built yet. Building...
  call npm.cmd run build
  if errorlevel 1 (
    echo [ERROR] Build failed. Run setup.bat first.
    pause
    exit /b 1
  )
)

echo [1/2] Stopping any old server on port 3001...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo [2/2] Starting server, opening browser on http://localhost:3001
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3001"
node server/watcher.mjs

echo Server stopped.
pause