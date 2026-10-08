Write-Output "=== Relevant Ports Listening Status ==="
$ports = 3001, 3006, 8090, 8123, 8080, 8000, 5432
foreach ($p in $ports) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
  if ($conn) {
    $proc = $conn[0].OwningProcess
    $name = (Get-Process -Id $proc -ErrorAction SilentlyContinue).ProcessName
    Write-Output ("Port {0,-6} LISTENING  PID={1,-8} Proc={2}" -f $p, $proc, $name)
  } else {
    Write-Output ("Port {0,-6} NOT RUNNING" -f $p)
  }
}
