# Non-admin auto-start: put a shortcut to the VBS launcher in the user's Startup folder
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'RestoCost ERP Pro.lnk'

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$sc.Arguments = '"{0}\RestoCost ERP Pro.vbs"' -f $appDir
$sc.WorkingDirectory = $appDir
$sc.Description = 'RestoCost ERP Pro - starts server and opens the app at login'
if (Test-Path (Join-Path $appDir 'assets\restocost.ico')) {
  $sc.IconLocation = (Join-Path $appDir 'assets\restocost.ico') + ',0'
}
$sc.Save()
Write-Output ("Startup shortcut created: " + $lnkPath)
