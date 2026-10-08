Import-Module WebAdministration

$siteName = "RestoCostERP"
$site = Get-Website -Name $siteName -ErrorAction SilentlyContinue

if ($site) {
    Write-Host "Found site: $siteName"
    Write-Host "Current bindings: $($site.Bindings | ForEach-Object { $_.BindingInformation })"
    
    # Clear existing bindings
    $site.Bindings.Clear()
    
    # Add correct binding
    New-WebBinding -Name $siteName -Protocol "http" -Port 80 -HostHeader "erp.restocost.shop"
    Write-Host "Binding fixed to: http://erp.restocost.shop:80"
    
    # Start site
    Start-Website -Name $siteName
    Write-Host "Site started"
    
    # Verify
    $site2 = Get-Website -Name $siteName
    Write-Host "State: $($site2.State)"
    Write-Host "Bindings: $($site2.Bindings | ForEach-Object { $_.BindingInformation })"
} else {
    Write-Host "Site not found, creating..."
    New-Website -Name $siteName -PhysicalPath "E:\MASSOBI APP\NEW APP" -Port 80 -HostHeader "erp.restocost.shop" -ApplicationPool "RestoCostERP" -Force
    Write-Host "Site created and started"
}