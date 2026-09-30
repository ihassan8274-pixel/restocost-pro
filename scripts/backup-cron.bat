@echo off
REM RestoCost ERP Pro - Automated PostgreSQL Backup Script (Windows)
REM Runs daily via Task Scheduler. Keeps last 30 days locally.

setlocal enabledelayedexpansion

REM Configuration
set BACKUP_DIR=%USERPROFILE%\restocost-backups
set DATABASE_URL=postgresql://restocost:restocost@127.0.0.1:5433/restocost2
set RETENTION_DAYS=30
set S3_BUCKET=

REM Timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DATETIME=%%I
set TIMESTAMP=!DATETIME:~0,4!!DATETIME:~4,2!!DATETIME:~6,2!_!DATETIME:~8,2!!DATETIME:~10,2!!DATETIME:~12,2!
set BACKUP_FILE=restocost_%TIMESTAMP%.sql.gz
set BACKUP_PATH=%BACKUP_DIR%\%BACKUP_FILE%

REM Logging
echo [%date% %time%] Starting backup: %BACKUP_FILE%

mkdir "%BACKUP_DIR%" 2>nul

REM Dump database
pg_dump "%DATABASE_URL%" | gzip > "%BACKUP_PATH%"
if errorlevel 1 (
    echo [%date% %time%] ERROR: pg_dump failed
    exit /b 1
)

echo [%date% %time%] Backup completed: %BACKUP_PATH%

REM Remove old backups (PowerShell for date math)
powershell -Command "Get-ChildItem '%BACKUP_DIR%\restocost_*.sql.gz' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-%RETENTION_DAYS%) } | Remove-Item -Force"

REM Optional: Upload to S3
if not "%S3_BUCKET%"=="" (
    echo [%date% %time%] Uploading to S3: s3://%S3_BUCKET%/backups/%BACKUP_FILE%
    aws s3 cp "%BACKUP_PATH%" "s3://%S3_BUCKET%/backups/%BACKUP_FILE%"
    if errorlevel 1 (
        echo [%date% %time%] WARNING: S3 upload failed
    ) else (
        echo [%date% %time%] S3 upload successful
    )
)

REM Verify backup integrity
gzip -t "%BACKUP_PATH%"
if errorlevel 1 (
    echo [%date% %time%] ERROR: Backup file corrupted!
    exit /b 1
)

echo [%date% %time%] Backup job finished successfully