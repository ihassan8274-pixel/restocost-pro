# ============================================================
#  RestoCost - Unified Google Drive Push (all 4 gateway systems)
#  Collects the databases of every app linked to the gateway and
#  pushes them to Google Drive on every call, keeping a rolling
#  window of backups both locally and on Drive.
#
#  Systems covered:
#    restocost   -> E:\MASSOBI APP\NEW APP\server\data\restocost.db
#    bukharo     -> E:\MASSOBI APP\bukharo\server\data\restocost.db
#    payroll     -> E:\MASSOBI APP\payroll\payroll.db
#    cost-report -> docker restocost-postgres pg_dump (PostgreSQL)
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'
$logFile = Join-Path $PSScriptRoot 'drive-push.log'

function Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $msg" | Add-Content -LiteralPath $logFile
}

function Test-DriveReady {
  param([string]$path)
  return (Test-Path $path) -and ((Get-Item $path -ErrorAction SilentlyContinue).PSIsContainer)
}

# ---------- 1) Detect Google Drive folder ----------
$driveCandidates = @(
  "$env:USERPROFILE\GoogleDrive",
  "$env:USERPROFILE\Google Drive",
  "$env:USERPROFILE\My Drive",
  'G:\My Drive',
  'G:\GoogleDrive',
  'H:\My Drive'
)
$driveBase = $null
foreach ($cand in $driveCandidates) { if (Test-DriveReady $cand) { $driveBase = $cand; break } }

# Fallback: scan fixed drives
if (-not $driveBase) {
  foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null })) {
    foreach ($name in @('My Drive', 'GoogleDrive', 'Google Drive')) {
      $p = Join-Path "$($d.Root)" $name
      if (Test-DriveReady $p) { $driveBase = $p; break }
    }
    if ($driveBase) { break }
  }
}

if (-not $driveBase) {
  Log 'WARN: Google Drive folder not found - backup kept locally only.'
} else {
  Log "INFO: Drive folder detected at $driveBase"
}

$root = 'E:\MASSOBI APP'
$backupDir = Join-Path $root 'backups'
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# ---------- 2) Stage the databases ----------
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$stage = Join-Path $env:TEMP "rcerp_drivepush_$ts"
New-Item -ItemType Directory -Path $stage | Out-Null

# SQLite databases
$sqliteTargets = @(
  @{ src = 'E:\MASSOBI APP\NEW APP\server\data\restocost.db'; rel = 'restocost.db' },
  @{ src = 'E:\MASSOBI APP\bukharo\server\data\restocost.db'; rel = 'bukharo.db' },
  @{ src = 'E:\MASSOBI APP\payroll\payroll.db';               rel = 'payroll.db' }
)
$sqliteOk = 0
foreach ($t in $sqliteTargets) {
  $dest = Join-Path $stage $t.rel
  if (Test-Path $t.src) {
    Copy-Item -LiteralPath $t.src -Destination $dest -Force
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 0)) { $sqliteOk++ }
    else { Log "WARN: empty/undefined copy for $($t.rel)" }
  } else {
    Log "WARN: source missing for $($t.rel): $($t.src)"
  }
}

# PostgreSQL dump for cost-report (restocost db in container restocost-postgres)
$pgOk = $false
try {
  $pgFile = Join-Path $stage 'cost-report.sql'
  docker exec restocost-postgres pg_dump -U restocost -d restocost --clean --if-exists --no-owner -f /tmp/rcerp_push_backup.sql 2>$null
  if ($LASTEXITCODE -eq 0) {
    docker cp "restocost-postgres:/tmp/rcerp_push_backup.sql" $pgFile 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-Path $pgFile) -and ((Get-Item $pgFile).Length -gt 100)) {
      $pgOk = $true
    } else {
      Log 'WARN: pg_dump produced no/empty sql copy'
    }
  } else {
    Log 'WARN: pg_dump failed inside container'
  }
} catch {
  Log "WARN: pg_dump exception: $($_.Exception.Message)"
}
# cleanup temp inside container (best effort)
docker exec restocost-postgres sh -c 'rm -f /tmp/rcerp_push_backup.sql' 2>$null | Out-Null

if (-not ($sqliteOk -or $pgOk)) {
  Log 'ERROR: no database captured at all - aborting before zip.'
  Remove-Item -LiteralPath $stage -Recurse -Force
  exit 1
}

# ---------- 3) Zip the bundle ----------
$zipName = "restocost_all_systems_$ts.zip"
$zip = Join-Path $backupDir $zipName
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
Remove-Item -LiteralPath $stage -Recurse -Force

if (-not (Test-Path $zip)) { Log 'ERROR: failed to create unified zip'; exit 1 }
$size = '{0:N0} KB' -f ((Get-Item -LiteralPath $zip).Length / 1KB)
Log "OK: created $zipName ($size ; sqlite=$sqliteOk/3 ; pg=$pgOk)"

# ---------- 4) Push to Drive ----------
if ($driveBase) {
  $targetDir = Join-Path $driveBase 'RestoCostBackups'
  if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
  Copy-Item -LiteralPath $zip -Destination $targetDir -Force
  if (Test-Path (Join-Path $targetDir $zipName)) {
    Log "OK: uploaded to Drive -> RestoCostBackups\$zipName"
    # keep newest 14 bundles on Drive
    Get-ChildItem -LiteralPath $targetDir -Filter 'restocost_all_systems_*.zip' |
      Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Log "PRUNE: removed old $($_.Name)" }
  } else {
    Log 'ERROR: copy to Drive folder failed (check Drive is running)'
  }
}

# ---------- 5) Prune local unified backups (keep 14) ----------
Get-ChildItem -LiteralPath $backupDir -Filter 'restocost_all_systems_*.zip' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

Log 'PUSH complete.'