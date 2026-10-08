Write-Output "=== Startup Folder Shortcuts ==="
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem $startup -Filter *.lnk | ForEach-Object {
  $lnk = $shell.CreateShortcut($_.FullName)
  Write-Output ("--- " + $_.Name + " ---")
  Write-Output ("  Target: " + $lnk.TargetPath)
  Write-Output ("  Args: " + $lnk.Arguments)
  Write-Output ("  WorkDir: " + $lnk.WorkingDirectory)
  Write-Output ""
}

Write-Output "=== Docker Auto-Restart Policies ==="
docker inspect --format '{{.Name}} -> {{.HostConfig.RestartPolicy.Name}}' (docker ps -aq) 2>$null

Write-Output ""
Write-Output "=== Key Scheduled Tasks ==="
Get-ScheduledTask | Where-Object {$_.TaskName -match 'RestoCost|ERP|Docker'} | Select-Object TaskName, State | Format-Table -AutoSize
