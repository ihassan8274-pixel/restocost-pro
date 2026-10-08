@echo off
title Stopping ERP Systems...
echo.
echo Stopping RestoCost ERP (port 3001)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Stopping ERPNext (Docker)...
wsl -d Ubuntu -- bash -c "cd ~/erpnext-docker && docker compose down"

echo.
echo Both ERP systems stopped.
pause
