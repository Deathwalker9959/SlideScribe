# Enable SlideScribe COM Add-in in PowerPoint
# Sets LoadBehavior to 3 (Load at startup)

$ErrorActionPreference = "Stop"

Write-Host "Enabling SlideScribe COM Add-in..." -ForegroundColor Yellow

$ProgId = "SlideScribeMediaComAddIn.ThisAddIn"
$RegPath = "HKCU:\SOFTWARE\Microsoft\Office\PowerPoint\Addins\$ProgId"

try {
    if (Test-Path $RegPath) {
        # Set LoadBehavior to 3 (Load on startup and currently loaded)
        Set-ItemProperty -Path $RegPath -Name "LoadBehavior" -Value 3 -Type DWord
        Write-Host "✓ Add-in enabled successfully" -ForegroundColor Green
        Write-Host "  Registry path: $RegPath" -ForegroundColor Gray
        Write-Host "  LoadBehavior: 3 (Load at startup)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Add-in not found in registry" -ForegroundColor Red
        Write-Host "  Run RegisterAddin.ps1 first" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host "Restart PowerPoint to apply changes" -ForegroundColor Cyan

} catch {
    Write-Host "✗ Failed to enable add-in: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
