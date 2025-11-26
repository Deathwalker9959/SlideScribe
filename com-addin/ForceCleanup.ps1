# Force cleanup VSTO ClickOnce deployment
# This script aggressively removes all traces of the com-addin VSTO deployment
# Run as Administrator

$ErrorActionPreference = "Continue"

Write-Host "=== VSTO ClickOnce Force Cleanup ===" -ForegroundColor Red
Write-Host ""

# 1. Close PowerPoint
Write-Host "[1] Closing PowerPoint..." -ForegroundColor Yellow
Get-Process POWERPNT -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Write-Host "    Done" -ForegroundColor Green

# 2. Kill VSTOInstaller processes
Write-Host "[2] Stopping VSTO Installer processes..." -ForegroundColor Yellow
Get-Process VSTOInstaller -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "    Done" -ForegroundColor Green

# 3. Clear ClickOnce deployment cache (MOST IMPORTANT)
Write-Host "[3] Clearing ClickOnce deployment cache..." -ForegroundColor Yellow
$clickOnceCache = "$env:LOCALAPPDATA\Apps\2.0"
if (Test-Path $clickOnceCache) {
    Write-Host "    Removing entire ClickOnce cache: $clickOnceCache" -ForegroundColor Gray
    Remove-Item -Path $clickOnceCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    ✓ ClickOnce cache cleared" -ForegroundColor Green
} else {
    Write-Host "    No cache found" -ForegroundColor Gray
}

# 4. Clear VSTO assembly cache
Write-Host "[4] Clearing VSTO assembly cache..." -ForegroundColor Yellow
$assemblyCache = "$env:LOCALAPPDATA\assembly\dl3"
if (Test-Path $assemblyCache) {
    Get-ChildItem $assemblyCache -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*com-addin*" } |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    Removed: $($_.Name)" -ForegroundColor Gray
        }
    Write-Host "    ✓ Assembly cache cleared" -ForegroundColor Green
}

# 5. Remove registry entries
Write-Host "[5] Removing registry entries..." -ForegroundColor Yellow
$regPaths = @(
    "HKCU:\Software\Microsoft\Office\PowerPoint\Addins\*",
    "HKCU:\Software\Microsoft\VSTO\*",
    "HKCU:\Software\Classes\Software\Microsoft\Windows\CurrentVersion\Deployment\SideBySide\2.0\*"
)

foreach ($path in $regPaths) {
    Get-Item $path -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*com-addin*" -or $_.GetValue("DisplayName") -like "*com-addin*" } |
        ForEach-Object {
            Remove-Item $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    Removed: $($_.PSPath)" -ForegroundColor Gray
        }
}
Write-Host "    ✓ Registry cleaned" -ForegroundColor Green

# 6. Clear Windows Installer cache
Write-Host "[6] Clearing Windows Installer entries..." -ForegroundColor Yellow
$uninstallPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)

foreach ($path in $uninstallPaths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like "*com-addin*" } |
        ForEach-Object {
            Write-Host "    Found: $($_.DisplayName)" -ForegroundColor Gray
            Remove-Item $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        }
}
Write-Host "    ✓ Installer entries cleared" -ForegroundColor Green

# 7. Clear temp VSTO files
Write-Host "[7] Clearing temp VSTO files..." -ForegroundColor Yellow
$tempPaths = @(
    "$env:TEMP\VSTOInstaller*",
    "$env:TEMP\*.vsto",
    "$env:TEMP\*com-addin*"
)

foreach ($pattern in $tempPaths) {
    Get-Item $pattern -ErrorAction SilentlyContinue |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    Removed: $($_.Name)" -ForegroundColor Gray
        }
}
Write-Host "    ✓ Temp files cleared" -ForegroundColor Green

Write-Host ""
Write-Host "=== CLEANUP COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Run: npm run build:com-addin" -ForegroundColor Cyan
Write-Host "2. Run: npm run start:all" -ForegroundColor Cyan
Write-Host ""
Write-Host "The new version should install without conflicts." -ForegroundColor White
Write-Host ""
