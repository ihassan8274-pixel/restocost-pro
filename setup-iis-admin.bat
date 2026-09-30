@echo off
REM Run as Administrator
echo =========================================
echo Setting up IIS for RestoCost ERP
echo =========================================

REM 1. Check URL Rewrite
reg query "HKLM\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] URL Rewrite not installed. Download: https://www.iis.net/downloads/microsoft/url-rewrite
) else (
    echo [OK] URL Rewrite installed
)

REM 2. Check ARR
reg query "HKLM\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] ARR not installed. Download: https://www.iis.net/downloads/microsoft/application-request-routing
) else (
    echo [OK] ARR installed
)

REM 3. Enable ARR proxy
echo Enabling ARR proxy...
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:true /commit:apphost 2>&1

REM 4. Create App Pool
echo Creating App Pool...
%windir%\system32\inetsrv\appcmd.exe add apppool /name:RestoCostERP 2>&1
%windir%\system32\inetsrv\appcmd.exe set apppool "RestoCostERP" /managedRuntimeVersion:"" 2>&1
%windir%\system32\inetsrv\appcmd.exe set apppool "RestoCostERP" /enable32BitAppOnWin64:true 2>&1

REM 5. Create Site (HTTP)
echo Creating Site...
%windir%\system32\inetsrv\appcmd.exe add site /name:RestoCostERP /physicalPath:"E:\MASSOBI APP\NEW APP" /bindings:http://erp.restocost.shop:80: 2>&1

REM 6. Verify
echo.
echo Verifying...
%windir%\system32\inetsrv\appcmd.exe list site "RestoCostERP"
%windir%\system32\inetsrv\appcmd.exe list apppool "RestoCostERP"

echo.
echo =========================================
echo Done. Next: Get SSL cert (Let's Encrypt) for HTTPS 443
echo Run: win-acme or certbot, then add HTTPS binding
echo =========================================
pause