$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "RestoCost ERPServer"

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$appDir\RestoCost ERP Pro.vbs""" -WorkingDirectory $appDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -RunOnlyIfNetworkAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "RestoCost ERP Pro server auto-start at Windows startup (silent background)" -Force -User "SYSTEM" | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Output "Task registered and started: $taskName (runs at system startup, silent background)"