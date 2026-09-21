@echo off
echo ============================================
echo   Add erpnext.localhost to hosts file
echo   (Run as Administrator!)
echo ============================================
echo.
echo Adding 127.0.0.1 erpnext.localhost...
echo. >> C:\Windows\System32\drivers\etc\hosts
echo 127.0.0.1 erpnext.localhost >> C:\Windows\System32\drivers\etc\hosts
echo.
echo Done! Now open: http://erpnext.localhost:8080
echo Login: Administrator / admin123
echo.
pause
