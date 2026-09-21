Write-Output "=== Docker Restart Policies (Check) ==="
docker inspect --format '{{.Name}} | {{.HostConfig.RestartPolicy.Name}}' "inventory-prediction-and-managment-system-ml--main-api-1"