@echo off
echo ============================================
echo   Fix WSL Port Forwarding (Run as Admin!)
echo ============================================
echo.

REM Get WSL IP
for /f "tokens=*" %%i in ('wsl -d Ubuntu -e hostname -I') do set WSL_IP=%%i
for /f "tokens=1" %%a in ("%WSL_IP%") do set WSL_IP=%%a

echo WSL IP: %WSL_IP%
echo.

echo Removing old rules...
netsh interface portproxy delete v4tov4 listenport=8080 listenaddress=0.0.0.0 2>nul
netsh interface portproxy delete v4tov4 listenport=8069 listenaddress=0.0.0.0 2>nul
netsh interface portproxy delete v4tov4 listenport=9000 listenaddress=0.0.0.0 2>nul
netsh interface portproxy delete v4tov4 listenport=8000 listenaddress=0.0.0.0 2>nul

echo Adding port forwarding...
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=%WSL_IP%
netsh interface portproxy add v4tov4 listenport=8069 listenaddress=0.0.0.0 connectport=8069 connectaddress=%WSL_IP%
netsh interface portproxy add v4tov4 listenport=9000 listenaddress=0.0.0.0 connectport=9000 connectaddress=%WSL_IP%
netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=%WSL_IP%

echo.
echo Current rules:
netsh interface portproxy show v4tov4

echo.
echo ============================================
echo   Done! Try opening:
echo   http://localhost:8069  (Odoo)
echo   http://localhost:8080  (ERPNext)
echo ============================================
pause
