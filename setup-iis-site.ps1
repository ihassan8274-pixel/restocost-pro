<# 
  Setup IIS Reverse Proxy for erp.restocost.shop -> localhost:3033
  Run as Administrator
#>

param(
  [string]$SiteName = "RestoCost ERP",
  [string]$Domain = "erp.restocost.shop",
  [int]$NodePort = 3033,
  [string]$PhysicalPath = "E:\MASSOBI APP\NEW APP",
  [string]$CertThumbprint = ""  # Optional: existing cert thumbprint for HTTPS binding
)

Import-Module WebAdministration

Write-Host "=== Setting up IIS site: $SiteName ===" -ForegroundColor Cyan

# 1. Ensure URL Rewrite & ARR are installed
if (-not (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite" -ErrorAction SilentlyContinue)) {
    Write-Warning "URL Rewrite not installed. Download from https://www.iis.net/downloads/microsoft/url-rewrite"
}
if (-not (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing" -ErrorAction SilentlyContinue)) {
    Write-Warning "ARR not installed. Download from https://www.iis.net/downloads/microsoft/application-request-routing"
}

# 2. Enable ARR proxy
Write-Host "Enabling ARR proxy..." -ForegroundColor Yellow
try {
    $arrConfig = Get-WebConfigurationProperty -Filter "system.webServer/proxy" -PSPath "MACHINE/WEBROOT/APPHOST"
    if ($null -eq $arrConfig) {
        Set-WebConfigurationProperty -Filter "system.webServer/proxy" -Name "enabled" -Value "True" -PSPath "MACHINE/WEBROOT/APPHOST"
        Write-Host "ARR proxy enabled" -ForegroundColor Green
    }
} catch {
    Write-Warning "Could not enable ARR proxy automatically. Do it manually in IIS Manager."
}

# 3. Create App Pool
$poolName = "$SiteName Pool"
if (-not (Test-Path "IIS:\AppPools\$poolName")) {
    New-WebAppPool -Name $poolName -Force
    Set-ItemProperty "IIS:\AppPools\$poolName" -Name "managedRuntimeVersion" -Value ""
    Set-ItemProperty "IIS:\AppPools\$poolName" -Name "enable32BitAppOnWin64" -Value $true
    Write-Host "Created App Pool: $poolName" -ForegroundColor Green
}

# 4. Create/Update Site
$sitePath = "IIS:\Sites\$SiteName"
if (Test-Path $sitePath) {
    Write-Host "Site exists, updating..." -ForegroundColor Yellow
    Remove-Website -Name $SiteName -Confirm:$false
}

# HTTP binding (port 80)
New-Website -Name $SiteName -PhysicalPath $PhysicalPath -Port 80 -HostHeader $Domain -ApplicationPool $poolName -Force
Write-Host "Created HTTP binding: $Domain:80" -ForegroundColor Green

# HTTPS binding (port 443) - if cert provided
if ($CertThumbprint) {
    $cert = Get-Item "Cert:\LocalMachine\My\$CertThumbprint" -ErrorAction SilentlyContinue
    if ($cert) {
        New-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $Domain -SslFlags 1
        # Bind certificate
        $binding = Get-WebBinding -Name $SiteName -Protocol https
        $binding.AddSslCertificate($cert.GetCertHashString(), "My")
        Write-Host "Created HTTPS binding: $Domain:443 with cert $CertThumbprint" -ForegroundColor Green
    } else {
        Write-Warning "Certificate $CertThumbprint not found in LocalMachine\My. Skipping HTTPS binding."
    }
} else {
    Write-Host "No cert thumbprint provided. Add HTTPS binding manually with a valid cert (Let's Encrypt)." -ForegroundColor Yellow
}

# 5. Copy web.config to physical path
$webConfig = Join-Path $PhysicalPath "web.config"
if (Test-Path $webConfig) {
    Write-Host "web.config already exists at $webConfig" -ForegroundColor Green
} else {
    Write-Warning "web.config not found at $webConfig. Place it there for reverse proxy rules."
}

Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Next steps:"
Write-Host "1. Ensure DNS A record for $Domain points to this server IP"
Write-Host "2. Get SSL cert (Let's Encrypt via win-acme or certbot) and re-run with -CertThumbprint"
Write-Host "3. Test: curl -I https://$Domain"