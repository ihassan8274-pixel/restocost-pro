@echo off
rem ============================================================
rem  RestoCost ERP Pro - Server Auto-Starter
rem  Kills any stale listener on port 3001, then starts the
rem  Node server detached and minimized so it survives logout.
rem ============================================================
cd /d "%~dp0"

rem --- stop any existing listener on port 3001 ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

ping -n 3 127.0.0.1 >nul

rem --- start server detached and minimized (via watcher so it self-heals) ---
start "RestoCost ERP Server" /min node server\watcher.mjs