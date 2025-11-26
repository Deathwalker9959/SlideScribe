# SlideScribe COM Add-in Registration Script
# Run this script as Administrator to register the COM Add-in

param(
    [Parameter(Mandatory=$false)]
    [string]$AddInPath = (Split-Path -Parent $MyInvocation.MyCommand.Path),

    [Parameter(Mandatory=$false)]
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

# Add-in details
$AddInName = "SlideScribe Media COM Add-in"
$AddInDll = "com-addin.dll"
$AddInManifest = "com-addin.manifest"
$ProgId = "SlideScribeMediaComAddIn.ThisAddIn"
$Description = "Advanced audio embedding and media manipulation for PowerPoint"

# Full paths
$DllPath = Join-Path $AddInPath "bin\Debug\$AddInDll"
$ManifestPath = Join-Path $AddInPath $AddInManifest

Write-Host "SlideScribe COM Add-in Registration Tool" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

if ($Unregister) {
    Write-Host "Unregistering COM Add-in..." -ForegroundColor Yellow

    try {
        # Remove registry entries
        Remove-Item -Path "HKLM:\SOFTWARE\Microsoft\Office\PowerPoint\AddIns\$ProgId" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "HKCU:\SOFTWARE\Microsoft\Office\PowerPoint\AddIns\$ProgId" -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host "COM Add-in unregistered successfully" -ForegroundColor Green
        Write-Host "You may need to restart PowerPoint for changes to take effect." -ForegroundColor Cyan
    }
    catch {
        Write-Host "Error unregistering add-in: $($_.Exception.Message)" -ForegroundColor Red
    }
}
else {
    Write-Host "Registering COM Add-in..." -ForegroundColor Yellow

    # Check if files exist
    if (-not (Test-Path $DllPath)) {
        throw "DLL file not found: $DllPath. Build the project first."
    }

    if (-not (Test-Path $ManifestPath)) {
        throw "Manifest file not found: $ManifestPath"
    }

    try {
        # Register for current user
        $RegPath = "HKCU:\SOFTWARE\Microsoft\Office\PowerPoint\AddIns\$ProgId"

        # Create registry entries
        New-Item -Path $RegPath -Force | Out-Null
        New-ItemProperty -Path $RegPath -Name "Description" -Value $Description -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $RegPath -Name "FriendlyName" -Value $AddInName -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $RegPath -Name "LoadBehavior" -Value 3 -PropertyType DWord -Force | Out-Null  # Load at startup
        New-ItemProperty -Path $RegPath -Name "Manifest" -Value $ManifestPath -PropertyType String -Force | Out-Null

        # Note: The assembly is already configured for COM in AssemblyInfo.cs
        # The VSTO runtime will handle COM registration automatically

        Write-Host "VSTO Add-in registered successfully!" -ForegroundColor Green
        Write-Host "DLL: $DllPath" -ForegroundColor Cyan
        Write-Host "Manifest: $ManifestPath" -ForegroundColor Cyan
        Write-Host "Named Pipe: SlideScribeComBridge" -ForegroundColor Cyan
        Write-Host "" -ForegroundColor Cyan
        Write-Host "To use the add-in:" -ForegroundColor White
        Write-Host "1. Restart PowerPoint" -ForegroundColor White
        Write-Host "2. Go to File, Options, Add-ins" -ForegroundColor White
        Write-Host "3. Select COM Add-ins from the dropdown" -ForegroundColor White
        Write-Host "4. Click Go and check SlideScribe Media COM Add-in" -ForegroundColor White

    }
    catch {
        Write-Host "Error registering add-in: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Make sure you are running this script as Administrator" -ForegroundColor Yellow
    }
}

Write-Host "" -ForegroundColor White
Write-Host "Script completed." -ForegroundColor Gray
