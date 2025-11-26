# SlideScribe COM Add-in Uninstall Script
# Removes the COM Add-in from the system

param(
    [Parameter(Mandatory=$false)]
    [string]$AddInName = "com-addin"
)

$ErrorActionPreference = "Continue"

Write-Host "SlideScribe COM Add-in Uninstaller" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""

# Function to uninstall via Programs and Features
function Uninstall-ViaRegistry {
    param([string]$DisplayName)

    $uninstallKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $found = $false
    foreach ($key in $uninstallKeys) {
        Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object {
            $_.DisplayName -like "*$DisplayName*"
        } | ForEach-Object {
            $found = $true
            Write-Host "[INFO] Found installation: $($_.DisplayName)" -ForegroundColor Cyan

            if ($_.UninstallString) {
                Write-Host "[UNINSTALL] Running uninstaller..." -ForegroundColor Yellow
                $uninstallCmd = $_.UninstallString -replace "msiexec.exe", "" -replace "/I", "/X"

                if ($uninstallCmd -match "MsiExec.exe") {
                    # MSI uninstall
                    Start-Process "msiexec.exe" -ArgumentList "$uninstallCmd /qn" -Wait
                } else {
                    # Direct uninstall string
                    cmd /c $_.UninstallString
                }
                Write-Host "[SUCCESS] Uninstalled successfully" -ForegroundColor Green
            }
        }
    }
    return $found
}

# Function to remove VSTO deployment manifest cache
function Clear-VSTOCache {
    Write-Host "[CLEANUP] Clearing VSTO deployment cache..." -ForegroundColor Yellow

    $vstoCachePaths = @(
        "$env:LOCALAPPDATA\Apps\2.0",
        "$env:LOCALAPPDATA\assembly\dl3"
    )

    foreach ($path in $vstoCachePaths) {
        if (Test-Path $path) {
            Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "*com-addin*" } |
                ForEach-Object {
                    Write-Host "[CLEANUP] Removing: $($_.FullName)" -ForegroundColor Gray
                    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                }
        }
    }
    Write-Host "[SUCCESS] Cache cleared" -ForegroundColor Green
}

# Function to remove registry entries
function Clear-RegistryEntries {
    Write-Host "[CLEANUP] Clearing registry entries..." -ForegroundColor Yellow

    $regKeys = @(
        "HKCU:\Software\Microsoft\Office\PowerPoint\Addins\SlideScribe.ComAddin",
        "HKCU:\Software\Microsoft\VSTO\Security\Inclusion\*"
    )

    foreach ($key in $regKeys) {
        if (Test-Path $key) {
            Write-Host "[CLEANUP] Removing registry key: $key" -ForegroundColor Gray
            Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[SUCCESS] Registry cleaned" -ForegroundColor Green
}

# Main uninstall process
try {
    # Step 1: Uninstall via Programs and Features
    $wasInstalled = Uninstall-ViaRegistry -DisplayName $AddInName

    if (-not $wasInstalled) {
        Write-Host "[INFO] No installation found in Programs and Features" -ForegroundColor Cyan
    }

    # Step 2: Clear VSTO cache
    Clear-VSTOCache

    # Step 3: Clear registry entries
    Clear-RegistryEntries

    Write-Host ""
    Write-Host "[SUCCESS] Uninstall completed successfully" -ForegroundColor Green
    Write-Host "[INFO] You can now build and install the new version" -ForegroundColor Cyan

} catch {
    Write-Host ""
    Write-Host "[ERROR] Uninstall failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[INFO] You may need to run this script as Administrator" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Uninstall process completed." -ForegroundColor Gray
