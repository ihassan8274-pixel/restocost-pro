@echo off
cd /d "%~dp0"
echo =============================================
echo  RestoCost ERP Pro - إعداد التشغيل التلقائي
echo =============================================
echo.
echo سيتم تسجيل مهمة مجدولة لتشغيل السيرفر تلقائياً مع إقلاع الويندوز
echo في الخلفية بدون ظهور أي نوافذ (Silent Background).
echo.
echo ملاحظة: يتطلب صلاحيات مسؤول (Run as Administrator)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0\setup-autostart.ps1'"
echo.
echo تم الانتهاء. اضغط أي مفتاح للخروج...
pause