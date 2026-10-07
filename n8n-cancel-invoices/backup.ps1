# نسخ احتياطي للبيانات كل 2 ساعة — يُشغَّل تلقائيًا بالمهمة المجدولة
$base = "E:\MASSOBI APP\NEW APP\n8n-cancel-invoices"
$backupDir = Join-Path $base "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$envFile = Join-Path $base "backup.env"
if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '=') { $p = $_ -split '=',2; [Environment]::SetEnvironmentVariable($p[0].Trim(), $p[1].Trim(), 'Process') } } }

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$ok = $true

# 1) نسخة من بيانات الشيت (CSV منشور)
if ($env:SHEET_CSV_URL) {
  try {
    Invoke-WebRequest -Uri $env:SHEET_CSV_URL -OutFile (Join-Path $backupDir "sheet-$stamp.csv") -UseBasicParsing
  } catch { $ok = $false; "$(Get-Date) فشل تحميل الشيت: $_" | Out-File (Join-Path $backupDir 'error.log') -Append }
}

# 2) نسخة من الصور المحفوظة محليًا
$photosDir = Join-Path $base "photos"
if (Test-Path $photosDir) {
  Copy-Item $photosDir (Join-Path $backupDir "photos-$stamp") -Recurse -Force
}

# 3) حذف النسخ الأقدم من 7 أيام
Get-ChildItem $backupDir | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

"$(Get-Date) backup done ok=$ok" | Out-File (Join-Path $backupDir 'backup.log') -Append
