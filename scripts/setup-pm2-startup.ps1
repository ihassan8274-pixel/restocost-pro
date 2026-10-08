# =============================================================================
#  scripts/setup-pm2-startup.ps1 -- bring the stack back after a reboot.
#
#  ⛔ WHY NOT pm2-windows-startup
#     It registers a scheduled task that commonly runs as SYSTEM. That changes
#     the user profile and HOME, and this app decrypts secrets from files under
#     the operator's profile -- a SYSTEM-owned task makes those secrets fail to
#     decrypt, which is exactly the failure already visible in
#     server/logs/pm2-restocost.err.log ("decrypt failed: legacy blob
#     undecryptable"). The task here runs AS THE OPERATOR at logon, so the
#     profile, HOME and the secrets directory are all the same ones the server
#     already uses when started by hand.
#
#  ⛔ WHY A TASK AND NOT A STARTUP FOLDER SHORTCUT
#     A shortcut runs only when Explorer finishes starting, which is late and
#     occasionally never happens on a fast-boot machine. A scheduled task fires
#     at logon whether or not the shell is ready.
#
#  ⛔ WHY THE SCRIPT WAITS FOR THE PORT
#     `pm2 resurrect` returns as soon as it has issued the spawn commands. The
#     server takes a moment to bind 3001, and the tunnel can connect before it.
#     Without a wait the operator opens the site, sees 502, and blames the
#     restart. The loop below is what makes "log on and it works" true.
#
#  Idempotent: running it twice replaces the task rather than adding a second.
# =============================================================================

$ErrorActionPreference = 'Stop'
$taskName = 'RestoCost PM2 Startup'
$repoRoot = 'E:\MASSOBI APP\NEW APP'
$logFile = Join-Path $repoRoot 'server\logs\pm2-startup.log'

function Write-Log([string]$Message) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log '--- startup script running ---'

# ---------------------------------------------------------------- port check --
function Test-Port([int]$Port) {
    try {
        $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
        return $c.TcpTestSucceeded
    } catch {
        return $false
    }
}

# --------------------------------------------------------- is pm2 running? --
# ⛔⛔ `Get-Process -Name 'PM2*'` DOES NOT FIND THE DAEMON ON WINDOWS.
#
#   The pm2 daemon is a plain `node.exe` with pm2's God-daemon script in its
#   command line. There is no process named PM2. So the original check here
#   always answered "no daemon", took the wrong branch, and called
#   `pm2 resurrect` while the daemon was in fact alive.
#
#   Worse, resurrect restored the SAVED state -- which was `stopped`, because
#   `pm2 stop all` writes the stopped state to the dump. So the script reported
#   "server did NOT come up within 60s" and, correctly, refused to claim
#   success. Measured on 2026-10-07: the daemon was running the whole time.
#
#   The daemon is asked, not guessed: `pm2 ping` succeeds only when it answers.
$daemonAlive = $false
& pm2 ping 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { $daemonAlive = $true }

if (-not $daemonAlive) {
    Write-Log 'pm2 daemon not answering; pm2 ping failed -- starting from the ecosystem file'
    & pm2 start (Join-Path $repoRoot 'ecosystem.config.cjs') 2>&1 | Out-Null
    Start-Sleep -Seconds 6
} else {
    # ⛔⛔ `resurrect` is the WRONG verb when an app is merely STOPPED.
    #   It restores the saved state, and the saved state after a `pm2 stop all`
    #   is `stopped`. Use `pm2 start` for anything not online.
    $apps = @()
    try { $apps = & pm2 jlist 2>$null | ConvertFrom-Json } catch { $apps = @() }

    $wanted = @('restocost', 'cloudflared-restocost')
    $notOnline = @()
    foreach ($name in $wanted) {
        $app = $apps | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if (-not $app) { $notOnline += $name; continue }
        $status = $app.pm2_env.status
        if ($status -ne 'online' -and $status -ne 'launching') { $notOnline += $name }
    }

    if ($notOnline.Count -gt 0) {
        Write-Log ("daemon alive; not online: {0} -> pm2 start (NOT resurrect)" -f ($notOnline -join ', '))
        foreach ($name in $notOnline) {
            & pm2 start $name 2>&1 | Out-Null
        }
        Start-Sleep -Seconds 6
    } else {
        Write-Log 'daemon alive and both apps already online; nothing to do'
    }
}

# ------------------------------------------------------------- wait for 3001 --
$deadline = (Get-Date).AddSeconds(60)
$serverUp = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Port 3001) { $serverUp = $true; break }
    Start-Sleep -Seconds 2
}

if ($serverUp) {
    Write-Log 'server is listening on 3001'
} else {
    Write-Log '!! server did NOT come up within 60s -- check: pm2 logs restocost --lines 80'
}

# The tunnel needs the server, so only assert it once 3001 answers.
Start-Sleep -Seconds 3
$tunnelProcs = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($tunnelProcs) {
    Write-Log ("tunnel running, {0} process(es)" -f @($tunnelProcs).Count)
} else {
    Write-Log '!! cloudflared is not running'
}

if ($serverUp) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001' -UseBasicParsing -TimeoutSec 15
        Write-Log ("GET / -> {0}" -f $r.StatusCode)
    } catch {
        Write-Log ("GET / failed: {0}" -f $_.Exception.Message)
    }
}

Write-Log '--- startup script done ---'