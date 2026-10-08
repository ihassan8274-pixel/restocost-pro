@echo off
setlocal
title RestoCost ERP Pro - Setup
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install from https://nodejs.org and retry.
  pause
  exit /b 1
)

echo [1/3] Installing dependencies (npm install)...
call npm.cmd install
if errorlevel 1 (
  echo [ERROR] Failed to install dependencies.
  pause
  exit /b 1
)

echo [2/3] Building the app (npm run build)...
call npm.cmd run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo [3/3] Setup complete.
echo Run start.bat to launch the app on http://localhost:3001
pause