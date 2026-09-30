@echo off
REM Run as Administrator
echo Enabling ARR Proxy...
C:\Windows\System32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:true /commit:apphost

echo Starting site...
C:\Windows\System32\inetsrv\appcmd.exe start site "RestoCostERP"

echo.
echo Verifying...
C:\Windows\System32\inetsrv\appcmd.exe list site "RestoCostERP"

echo.
echo Test with: curl -I http://erp.restocost.shop
pause