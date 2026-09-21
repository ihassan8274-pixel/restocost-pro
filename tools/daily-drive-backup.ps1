# ===============================================
#  RestoCost ERP - Daily Backup to Google Drive
#  Unified push for ALL 4 gateway systems now lives
#  in drive-push.ps1 (restocost + bukharo + payroll
#  + cost-report PostgreSQL). This script keeps the
#  full local zip for the main app and then triggers
#  the unified push above it.
# ===============================================
$ErrorActionPreference = 'SilentlyContinue'
$logFile = Join-Path $PSScriptRoot 'drive-backup.log'

function Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $msg" | Add-Content -LiteralPath $logFile
}

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root 'backups'
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# ---------- 1) Detect Google Drive folder ----------
$driveCandidates = @(
  "$env:USERPROFILE\GoogleDrive",
  "$env:USERPROFILE\Google Drive",
  "$env:USERPROFILE\My Drive",
  'G:\My Drive',
  'G:\GoogleDrive',
  'H:\My Drive'
)
$driveBase = $driveCandidates | Where-Object { (Test-Path $_) -and ((Get-Item $_ -ErrorAction SilentlyContinue).PSIsContainer) } | Select-Object -First 1

# Fallback: scan fixed drives for a Google Drive style folder at root level
if (-not $driveBase) {
  foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null })) {
    foreach ($name in @('My Drive', 'GoogleDrive', 'Google Drive')) {
      $p = Join-Path "$($d.Root)" $name
      if ((Test-Path $p) -and ((Get-Item $p -ErrorAction SilentlyContinue).PSIsContainer)) { $driveBase = $p; break }
    }
    if ($driveBase) { break }
  }
}

if (-not $driveBase) {
  Log 'WARN: Google Drive folder not found - install/sign-in to Google Drive for Desktop. Backup kept locally only.'
} else {
  Log "INFO: Drive folder detected at $driveBase"
}

# ---------- 2) Create the local full backup zip (main app + data) ----------
$ts = Get-Date -Format 'yyyyMMdd_HHmm'
$stage = Join-Path $env:TEMP "rcerp_drive_bak_$ts"
New-Item -ItemType Directory -Path $stage | Out-Null

$dir = 'E:\MASSOBI APP\NEW APP'
$dest = Join-Path $stage 'restocost'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$db = Join-Path $dir 'server\data\restocost.db'
if (Test-Path $db) { Copy-Item -LiteralPath $db -Destination $dest -Force }
$dataDir = Join-Path $dir 'server\data'
if (Test-Path $dataDir) { Copy-Item -LiteralPath (Join-Path $dataDir '*') -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue }

foreach ($m in @(
  @{ src = 'E:\MASSOBI APP\NEW APP\server\index.js'; rel = 'restocost\server\index.js' },
  @{ src = 'E:\MASSOBI APP\NEW APP\server\package.json'; rel = 'restocost\server\package.json' }
)) {
  if (Test-Path $m.src) {
    $tmp = Join-Path $stage $m.rel
    New-Item -ItemType Directory -Path (Split-Path $tmp -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $m.src -Destination $tmp -Force
  }
}

$zipName = "restocost_full_backup_$ts.zip"
$zip = Join-Path $backupDir $zipName
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
Remove-Item -LiteralPath $stage -Recurse -Force

if (-not (Test-Path $zip)) { Log 'ERROR: failed to create backup zip'; exit 1 }
Log "OK: created $zipName"

# ---------- 3) Copy to Drive ----------
if ($driveBase) {
  $targetDir = Join-Path $driveBase 'RestoCostBackups'
  if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
  Copy-Item -LiteralPath $zip -Destination $targetDir -Force
  if (Test-Path (Join-Path $targetDir $zipName)) {
    Log "OK: uploaded to Drive -> RestoCostBackups\$zipName"
    Get-ChildItem -LiteralPath $targetDir -Filter 'restocost_full_backup_*.zip' |
      Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Log "PRUNE: removed old $($_.Name)" }
  } else {
    Log 'ERROR: copy to Drive folder failed (check Drive app is running)'
  }
}

# ---------- 4) Unified push (all 4 gateway systems incl. cost-report PG) ----------
Log 'INFO: triggering unified drive-push for all 4 systems...'
& (Join-Path $PSScriptRoot 'drive-push.ps1')

# ---------- 5) Prune local backups (keep last 10) ----------
Get-ChildItem -LiteralPath $backupDir -Filter 'restocost_full_backup_*.zip' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
