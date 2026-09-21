@echo off
title Starting ERP Systems...
echo.
echo ========================================
echo   Starting RestoCost ERP + ERPNext...
echo ========================================
echo.

echo [1/2] Starting RestoCost ERP on port 3001...
cd /d "%~dp0"
start "" cmd /c "node server/watcher.mjs"

echo [2/2] Starting ERPNext on port 8080...
wsl -d Ubuntu -- bash -c "cd ~/erpnext-docker && docker compose up -d"

echo.
echo Waiting 10 seconds for servers to start...
timeout /t 10 /nobreak >nul

echo.
echo Opening Chrome...
start chrome "http://localhost:3001"
start chrome "http://localhost:8080"

echo.
echo ========================================
echo   Both ERPs are running!
echo ========================================
echo   RestoCost:  http://localhost:3001
echo   ERPNext:    http://localhost:8080
echo   ERPNext login: Administrator / admin123
echo ========================================
echo.
pause
