# =============================================================================
#  scripts/setup-pm2-startup.ps1 -- bring the stack back after a reboot/logon.
#
#  Registered as the scheduled task "RestoCost PM2 Startup" (logon trigger).
#  This script is the ONLY thing that should be starting the 3001 server.
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
#  ⛔ WHY `pm2 jlist` IS PARSED WITH node AND NOT ConvertFrom-Json
#     PowerShell 5.1 refuses pm2's JSON outright:
#       "Cannot convert the JSON string because a dictionary that was converted
#        from the string contains the duplicated keys 'username' and 'USERNAME'"
#     The old version called ConvertFrom-Json and swallowed the error, so the
#     status map came back EMPTY on every run -- the script therefore always
#     concluded both apps were "not online" and always ran `pm2 start`.
#     node's JSON.parse has no case-insensitive-key problem, so it is what
#     parses now.
#
#  ⛔ WHY EVERY pm2 CALL GOES THROUGH Invoke-Pm2
#     `& pm2 start x 2>&1 | Out-Null` under $ErrorActionPreference='Stop' is a
#     TERMINATING error the instant pm2 writes anything to stderr -- a [WARN]
#     is enough. Measured 2026-10-08 09:33: the task logged
#     "not online: restocost, cloudflared-restocost -> pm2 start", died on that
#     very call, never reached the port check, and the task ended with result 1
#     -- which is how the site came back as 502 after logon.
#     Invoke-Pm2 lowers $ErrorActionPreference for the call and returns text and
#     exit code instead of throwing, so a pm2 warning can never kill the boot.
#
#  ⛔ WHY `pm2 start` AND NEVER `pm2 resurrect`
#     resurrect restores the SAVED state, and the saved state after
#     `pm2 stop all` is `stopped`. It "succeeds" while bringing nothing up.
#
#  ⛔ WHY IT PRUNES DUPLICATE TUNNEL CONNECTORS
#     C:\RestoCost-Autostart\start-all.cmd and docker-watchdog.ps1 both launch
#     run-tunnel.cmd, and each launch adds another connector for the SAME
#     tunnel (erp.restocost.shop). Four were running on 2026-10-08. The PM2
#     process is kept and the extras are killed -- and only extras that really
#     serve this tunnel, matched on `run restocost`, so another session's
#     tunnel on the same machine is never touched.
#
#  Idempotent: a second run with both apps online changes nothing.
#  Exit code: 0 = server listening on 3001, 1 = still not listening.
# =============================================================================

$ErrorActionPreference = 'Stop'
$taskName = 'RestoCost PM2 Startup'
$repoRoot = 'E:\MASSOBI APP\NEW APP'
$logDir = Join-Path $repoRoot 'server\logs'
$logFile = Join-Path $logDir 'pm2-startup.log'
$wanted = @('restocost', 'cloudflared-restocost')

function Write-Log([string]$Message) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log '--- startup script running ---'

# ------------------------------------------------------------- pm2 wrappers --
# Neither of these may throw. A native command's stderr becomes a terminating
# error when $ErrorActionPreference is 'Stop', which is the bug this replaced.
function Invoke-Pm2 {
    param([string[]]$Pm2Args)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $text = (& pm2 @Pm2Args 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } catch {
        $text = $_.Exception.Message
        $code = 1
    } finally {
        $ErrorActionPreference = $previous
    }
    return [pscustomobject]@{ Code = $code; Text = $text }
}

# name -> @{ Status; Pid }. Never throws; returns @{} if pm2 cannot be read.
function Get-Pm2AppState {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $json = (& pm2 jlist 2>$null | Out-String)
    } catch {
        $json = ''
    } finally {
        $ErrorActionPreference = $previous
    }
    if ([string]::IsNullOrWhiteSpace($json)) { return @{} }

    $parsed = $json | & node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);for(const x of a){console.log([x.name,(x.pm2_env&&x.pm2_env.status)||'?',String(x.pid||0)].join('|'))}}catch(e){console.error(e.message);process.exit(3)}})"
    if ($LASTEXITCODE -ne 0) {
        Write-Log "!! could not parse pm2 jlist (node exit $LASTEXITCODE)"
        return @{}
    }

    $map = @{}
    foreach ($line in $parsed) {
        if ($line -match '^([^|]+)\|([^|]+)\|(\d+)$') {
            $map[$matches[1]] = @{ Status = $matches[2]; Pid = [int]$matches[3] }
        }
    }
    return $map
}

# ---------------------------------------------------------------- port check --
function Test-Port([int]$Port) {
    try {
        $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
        return $c.TcpTestSucceeded
    } catch {
        return $false
    }
}

# -------------------------------------------------------------- ensure stack --
$ping = Invoke-Pm2 @('ping')
$daemonAlive = ($ping.Code -eq 0)
Write-Log ("pm2 daemon answering: {0}" -f $daemonAlive)

if (-not $daemonAlive) {
    Write-Log 'daemon not answering -- starting from the ecosystem file'
    $null = Invoke-Pm2 @('start', (Join-Path $repoRoot 'ecosystem.config.cjs'))
    Start-Sleep -Seconds 6
}

$state = Get-Pm2AppState
if ($state.Count -eq 0) {
    Write-Log '!! pm2 returned no readable app state -- assuming apps are down'
    $notOnline = $wanted
} else {
    $notOnline = @()
    foreach ($name in $wanted) {
        if (-not $state.ContainsKey($name)) { $notOnline += $name; continue }
        $s = $state[$name].Status
        if ($s -ne 'online' -and $s -ne 'launching') { $notOnline += $name }
    }
}

if ($notOnline.Count -gt 0) {
    Write-Log ('not online: {0} -> pm2 start (NOT resurrect)' -f ($notOnline -join ', '))
    foreach ($name in $notOnline) { $null = Invoke-Pm2 @('start', $name) }
    Start-Sleep -Seconds 6
    $state = Get-Pm2AppState
} else {
    Write-Log 'both apps already online; nothing to start'
}

# --------------------------------------------------------- prune duplicates --
# Keep the connector PM2 supervises; drop the extras this machine accumulated
# from start-all.cmd / docker-watchdog.ps1 launching the same tunnel again.
$managedTunnelPid = 0
if ($state.ContainsKey('cloudflared-restocost')) { $managedTunnelPid = $state['cloudflared-restocost'].Pid }

if ($managedTunnelPid -gt 0) {
    $extras = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $managedTunnelPid -and $_.CommandLine -match 'run\s+restocost' })
    foreach ($e in $extras) {
        try {
            Stop-Process -Id $e.ProcessId -Force -ErrorAction Stop
            Write-Log ("killed duplicate tunnel connector pid {0}" -f $e.ProcessId)
        } catch {
            Write-Log ("could not kill duplicate connector {0}: {1}" -f $e.ProcessId, $_.Exception.Message)
        }
    }
    if ($extras.Count -eq 0) { Write-Log 'no duplicate tunnel connectors' }
} else {
    Write-Log 'tunnel connector not running under pm2; leaving connectors alone'
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
$tunnelProcs = @(Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue)
if ($tunnelProcs.Count -gt 0) {
    Write-Log ("tunnel running, {0} process(es)" -f $tunnelProcs.Count)
} else {
    Write-Log '!! cloudflared is not running'
}

if ($serverUp) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/health' -UseBasicParsing -TimeoutSec 15
        Write-Log ("GET /health -> {0}" -f $r.StatusCode)
    } catch {
        Write-Log ("GET /health failed: {0}" -f $_.Exception.Message)
    }
}

Write-Log '--- startup script done ---'

if ($serverUp) { exit 0 } else { exit 1 }