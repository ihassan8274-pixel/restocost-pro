# ===============================================
#  RestoCost - Server Control Panel (all systems)
#  check / start / stop / restart / full backup
#  Manages: app systems + central gateway + Cloudflare tunnel
#  Password-protected
# ===============================================
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = 'E:\MASSOBI APP\NEW APP'
$credFile = Join-Path $PSScriptRoot '.srvcred.json'
$backupDir = Join-Path $root 'backups'
$appSalt = 'RestoCost@ERP#2026'
$autoDir = 'C:\RestoCost-Autostart'
$startAllVbs = Join-Path $autoDir 'start-all.vbs'
$startAllCmd = Join-Path $autoDir 'start-all.cmd'

# ---------- System definitions ----------
# id, label, port, workDir (short path avoiding Arabic-name issues), startCmd (startup script),
# dbRel (DB path relative to the system folder), publicUrl, desc
$Systems = @(
  @{
    id        = 'restocost'
    label     = 'RestoCost ERP'
    desc      = 'Restaurant cost & supply-chain management'
    port      = 3001
    workDir   = 'E:\MASSOBI APP\NEW APP'
    startCmd  = (Join-Path $autoDir 'run-restocost.cmd')
    dbRel     = 'server\data\restocost.db'
    publicUrl = 'https://erp.restocost.shop'
},
  @{
    id        = 'payroll'
    label     = 'HR & Payroll System'
    desc      = 'HR, payroll & Saudi compliance'
    port      = 8090
    workDir   = 'E:\MASSOBI APP\payroll'
    startCmd  = (Join-Path $autoDir 'run-payroll.cmd')
    dbRel     = 'payroll.db'
    publicUrl = 'https://hr.restocost.shop'
  },
  @{
    id        = 'bukharo'
    label     = 'RestoCost Bukharo'
    desc      = 'Bukharo module'
    port      = 3002
    workDir   = 'E:\MASSOBI APP\bukharo'
    startCmd  = (Join-Path $autoDir 'run-bukharo.cmd')
    dbRel     = ''
    publicUrl = ''
  }
)

$Gateway = @{
label   = 'Central Gateway (System Portal)'
  desc    = 'System portal / store'
  port    = 8123
  startCmd = (Join-Path $autoDir 'run-gateway.cmd')
  publicUrl = 'https://restocost.shop'
}
$Tunnel = @{ label = 'Cloudflare tunnel' ; publicUrl = 'restocost.shop' }

# ---------- Security helpers ----------
function Get-Hash([string]$s) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($appSalt + ':' + $s))
  ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}
function Read-SecurePlain([string]$prompt) {
  Write-Host $prompt -NoNewline
  $sec = Read-Host ' ' -AsSecureString
  [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

# ---------- First run: create account ----------
if (-not (Test-Path $credFile)) {
  Clear-Host
  Write-Host ''
  Write-Host '  ===== FIRST RUN: Create Control Account =====' -ForegroundColor Cyan
  Write-Host ''
  $u = Read-Host '  Username'
  while ([string]::IsNullOrWhiteSpace($u)) { $u = Read-Host '  Username (cannot be empty)' }
  do { $p1 = Read-SecurePlain '  Password: ' } while ($p1.Length -lt 4)
  $p2 = Read-SecurePlain '  Confirm password: '
  while ($p1 -ne $p2) { Write-Host '  Passwords do not match, please retry' -ForegroundColor Red; $p2 = Read-SecurePlain '  Confirm password: ' }
  @{ user = $u.Trim(); hash = Get-Hash $p1 } | ConvertTo-Json | Set-Content -LiteralPath $credFile -Encoding UTF8
  Write-Host ''
  Write-Host '  Account created successfully - you will be asked to sign in now' -ForegroundColor Green
  Start-Sleep -Seconds 2
}

# ---------- Login screen ----------
$stored = Get-Content -LiteralPath $credFile -Raw | ConvertFrom-Json
$okLogin = $false
Clear-Host
for ($i = 3; $i -gt 0 -and -not $okLogin; $i--) {
  Write-Host ''
  Write-Host '  ==================================' -ForegroundColor DarkCyan
  Write-Host '   RestoCost - Server Control Panel' -ForegroundColor Cyan
  Write-Host '  ==================================' -ForegroundColor DarkCyan
  Write-Host "  Attempts remaining: $i" -ForegroundColor DarkGray
  $u = Read-Host '  Username'
  $p = Read-SecurePlain '  Password: '
  if ($u.Trim() -eq $stored.user -and (Get-Hash $p) -eq $stored.hash) { $okLogin = $true }
  else { Clear-Host; Write-Host '  Invalid credentials!' -ForegroundColor Red }
}
if (-not $okLogin) { Write-Host '  Closed after 3 failed attempts.' -ForegroundColor Red; Start-Sleep 2; exit }

# ---------- Check helpers ----------
function Test-PortOpen([int]$port) {
  (Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
}
function Get-PortPids([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}
function Get-ProcInfo([int]$port) {
  $pid0 = Get-PortPids $port | Select-Object -First 1
  if ($pid0) {
    $pr = Get-Process -Id $pid0 -ErrorAction SilentlyContinue
    if ($pr) { return "node PID $($pr.Id), running since $($pr.StartTime.ToString('HH:mm'))" }
  }
  return ''
}

# ---------- Start / Stop ----------
function Start-System($sys) {
  if (Test-PortOpen $sys.port) { Write-Host "  [..] $($sys.label) already running." -ForegroundColor DarkGray; return }
  Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + $sys.startCmd + '""') -WindowStyle Hidden
  Start-Sleep -Seconds 2
  if (Test-PortOpen $sys.port) { Write-Host "  [OK] Started $($sys.label) on port $($sys.port)." -ForegroundColor Green }
  else { Write-Host "  [X] Failed to start $($sys.label) - start it manually to see the error." -ForegroundColor Red }
}
function Stop-System($sys) {
  $pids = Get-PortPids $sys.port
  if ($pids) {
    $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
    Write-Host "  [OK] Stopped $($sys.label)." -ForegroundColor Yellow
  } else { Write-Host "  [..] $($sys.label) is not running." -ForegroundColor DarkGray }
}
function Invoke-SysRestart($sys) { Stop-System $sys; Start-Sleep 1; Start-System $sys }

# Cloudflare tunnel
function Test-Tunnel {
  (Get-Process cloudflared -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
}
function Start-Tunnel {
  if (Test-Tunnel) { Write-Host '  [..] Cloudflare tunnel already running.' -ForegroundColor DarkGray; return }
  Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + (Join-Path $autoDir 'run-tunnel.cmd') + '""') -WindowStyle Hidden
  Start-Sleep -Seconds 3
  if (Test-Tunnel) { Write-Host '  [OK] Cloudflare tunnel started.' -ForegroundColor Green }
  else { Write-Host '  [X] Failed to start Cloudflare tunnel.' -ForegroundColor Red }
}
function Stop-Tunnel {
  if (Test-Tunnel) {
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host '  [OK] Cloudflare tunnel stopped.' -ForegroundColor Yellow
  } else { Write-Host '  [..] Cloudflare tunnel is not running.' -ForegroundColor DarkGray }
}

# ---------- Full backup (all systems) ----------
function Invoke-FullBackup {
  if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
  $ts = Get-Date -Format 'yyyyMMdd_HHmm'
  $stage = Join-Path $env:TEMP "rcerp_all_bak_$ts"
  New-Item -ItemType Directory -Path $stage | Out-Null

  # Copy each system's database + its data folder
$sysDirs = @{
    'restocost' = 'E:\MASSOBI APP\NEW APP'
    'payroll'   = 'E:\MASSOBI APP\payroll'
  }
  foreach ($k in $sysDirs.Keys) {
    $dir = $sysDirs[$k]
    $dest = Join-Path $stage $k
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    # Database
    $dbRel = (($Systems | Where-Object { $_.id -eq $k }).dbRel)
    $db = Join-Path $dir $dbRel
    if (Test-Path $db) { Copy-Item -LiteralPath $db -Destination $dest -Force }
    # JSON data folder of the managed systems
    $dataDir = Join-Path $dir 'server\data'
    if (Test-Path $dataDir) { Copy-Item -LiteralPath (Join-Path $dataDir '*') -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue }
  }

  # Core server files (lightweight)
foreach ($m in @(
    @{ src = 'E:\MASSOBI APP\NEW APP\server\index.js'; rel = 'restocost\server\index.js' }
  )) {
    if (Test-Path $m.src) {
      $tmp = Join-Path $stage $m.rel
      New-Item -ItemType Directory -Path (Split-Path $tmp -Parent) -Force | Out-Null
      Copy-Item -LiteralPath $m.src -Destination $tmp -Force
    }
  }

  $zip = Join-Path $backupDir "restocost_full_backup_$ts.zip"
  Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
  Remove-Item -LiteralPath $stage -Recurse -Force
  if (Test-Path $zip) {
    $size = '{0:N0} KB' -f ((Get-Item -LiteralPath $zip).Length / 1KB)
    Write-Host "  [OK] Full backup: restocost_full_backup_$ts.zip ($size)" -ForegroundColor Green
  } else {
    Write-Host '  [X] Failed to create backup.' -ForegroundColor Red
  }
}

# ---------- General status ----------
function Show-AllStatus {
  Write-Host ''
  Write-Host '  ---- Systems ----' -ForegroundColor Cyan
  foreach ($sys in $Systems) {
    $up = Test-PortOpen $sys.port
    $st = if ($up) { 'RUNNING' } else { 'STOPPED' }
    $col = if ($up) { 'Green' } else { 'Red' }
    $info = if ($up) { '  ' + (Get-ProcInfo $sys.port) } else { '' }
    Write-Host ("  [" + $st + "] " + $sys.label.PadRight(30) + " port " + $sys.port + $info) -ForegroundColor $col
  }
  $gUp = Test-PortOpen $Gateway.port
  $gCol = if ($gUp) { 'Green' } else { 'Red' }
  Write-Host ("  [" + $(if ($gUp) {'RUNNING'} else {'STOPPED'}) + "] " + $Gateway.label + "  port " + $Gateway.port) -ForegroundColor $gCol
  $tUp = Test-Tunnel
  $tCol = if ($tUp) { 'Green' } else { 'Red' }
  Write-Host ("  [" + $(if ($tUp) {'RUNNING'} else {'STOPPED'}) + "] " + $Tunnel.label) -ForegroundColor $tCol
}

# ---------- Open public link ----------
function Open-Public($url) { Start-Process $url }

# ==========================================================
#  Main menu
# ==========================================================
while ($true) {
  Clear-Host
  Write-Host ''
  Write-Host '  ======================================' -ForegroundColor Cyan
  Write-Host '   RestoCost - Server Control Panel' -ForegroundColor Cyan
  Write-Host '  ======================================' -ForegroundColor Cyan
  Write-Host "   User: $($stored.user)   |   $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor DarkGray
  Show-AllStatus

  $latestBak = Get-ChildItem -LiteralPath $backupDir -Filter '*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latestBak) { Write-Host "   Last backup: $($latestBak.Name) ($($latestBak.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))" -ForegroundColor DarkGray }
  else { Write-Host '   Last backup: none yet - press 9 to create one' -ForegroundColor DarkGray }

schtasks /query /tn 'RestoCostERP-All' 2>$null | Out-Null
  $autoOn = ($LASTEXITCODE -eq 0)
  Write-Host "   Auto-start on boot: $(if ($autoOn) { 'enabled' } else { 'disabled' })" -ForegroundColor $(if ($autoOn) { 'Green' } else { 'DarkGray' })
  Write-Host ''
  Write-Host '   [1] Start all systems (verified)'
  Write-Host '   [2] Stop all systems'
  Write-Host '   [3] Auto-start on boot (toggle)'
  Write-Host '   [4] Start everything now (systems + gateway + tunnel)'
  Write-Host ''
  Write-Host '   ---- Individual control ----'
  foreach ($i in 0..($Systems.Count - 1)) {
    $n = 10 + $i
    Write-Host "   [$n] Toggle  $($Systems[$i].label)"
  }
  Write-Host '   [13] Start central gateway'
  Write-Host '   [14] Stop central gateway'
  Write-Host '   [15] Start Cloudflare tunnel'
  Write-Host '   [16] Stop Cloudflare tunnel'
  Write-Host ''
  Write-Host '   [9] Full backup now'
  Write-Host '   [7] Change username / password'
  Write-Host '   [0] Exit'
  Write-Host ''
  $choice = Read-Host '  Choose a number'

  switch ($choice) {
    '1' { foreach ($sys in $Systems) { Start-System $sys; Start-Sleep 1 } }
    '2' { foreach ($sys in $Systems) { Stop-System $sys; Start-Sleep 1 }; Stop-Tunnel }
'3' {
      Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $autoDir 'toggle-autostart.ps1') + '"') -WindowStyle Hidden
      Start-Sleep -Seconds 6
      schtasks /query /tn 'RestoCostERP-All' 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Write-Host '  [OK] Auto-start on boot enabled (scheduled task).' -ForegroundColor Green }
      else { Write-Host '  [OK] Auto-start on boot disabled.' -ForegroundColor Yellow }
    }
    '4' {
      foreach ($sys in $Systems) { Start-System $sys; Start-Sleep 1 }
      if (-not (Test-PortOpen $Gateway.port)) { Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + $Gateway.startCmd + '""') -WindowStyle Hidden; Write-Host '  [i] Starting gateway (8123)...' -ForegroundColor DarkGray }
      if (-not (Test-Tunnel)) { Start-Tunnel }
    }
    '9' { Invoke-FullBackup }
    '10' { Invoke-SysRestart $Systems[0] }
    '11' { Invoke-SysRestart $Systems[1] }
    '12' { Invoke-SysRestart $Systems[2] }
    '13' {
      if (Test-PortOpen $Gateway.port) { Write-Host '  [..] Gateway already running.' -ForegroundColor DarkGray }
      else { Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + $Gateway.startCmd + '""') -WindowStyle Hidden; Start-Sleep 2; if (Test-PortOpen $Gateway.port) { Write-Host '  [OK] Gateway started.' -ForegroundColor Green } else { Write-Host '  [X] Failed to start gateway.' -ForegroundColor Red } }
    }
    '14' {
      $gp = Get-PortPids $Gateway.port
      if ($gp) { $gp | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Write-Host '  [OK] Gateway stopped.' -ForegroundColor Yellow }
      else { Write-Host '  [..] Gateway is not running.' -ForegroundColor DarkGray }
    }
    '15' { Start-Tunnel }
    '16' { Stop-Tunnel }
    '7' {
      $nu = Read-Host '  New username'
      do { $np1 = Read-SecurePlain '  New password: ' } while ($np1.Length -lt 4)
      $np2 = Read-SecurePlain '  Confirm: '
      if ($np1 -eq $np2) {
        @{ user = $nu.Trim(); hash = Get-Hash $np1 } | ConvertTo-Json | Set-Content -LiteralPath $credFile -Encoding UTF8
        $stored = Get-Content -LiteralPath $credFile -Raw | ConvertFrom-Json
        Write-Host '  [OK] Login details updated.' -ForegroundColor Green
      } else { Write-Host '  [X] Passwords do not match - nothing changed.' -ForegroundColor Red }
    }
    '0' { exit }
  }
  if ($choice -notin @('6','0')) { Write-Host ''; Read-Host '  Press Enter to return to the menu' | Out-Null }
}

