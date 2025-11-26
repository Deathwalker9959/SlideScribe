# SlideScribe COM Add-in Build Script
# Builds the COM Add-in and prepares it for registration

param(
    [Parameter(Mandatory=$false)]
    [string]$Configuration = "Release",

    [Parameter(Mandatory=$false)]
    [switch]$Register,

    [Parameter(Mandatory=$false)]
    [switch]$UninstallFirst
)

$ErrorActionPreference = "Stop"
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$SolutionPath = Join-Path $ProjectPath "com-addin.sln"

Write-Host "SlideScribe COM Add-in Build Tool" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Function to check if add-in is already installed
function Test-AddinInstalled {
    $uninstallPaths = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($path in $uninstallPaths) {
        $installed = Get-ItemProperty $path -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*com-addin*" }
        if ($installed) {
            return $true
        }
    }
    return $false
}

# Check if already installed
$isInstalled = Test-AddinInstalled
if ($isInstalled) {
    Write-Host "[INFO] COM Add-in is already installed" -ForegroundColor Cyan
    Write-Host "[INFO] Skipping VSTO deployment to avoid reinstallation conflict" -ForegroundColor Cyan
    Write-Host ""
}

# Uninstall existing version if requested
if ($UninstallFirst) {
    Write-Host "[UNINSTALL] Removing existing installation..." -ForegroundColor Yellow
    $UninstallScript = Join-Path $ProjectPath "UninstallAddin.ps1"
    if (Test-Path $UninstallScript) {
        & powershell.exe -ExecutionPolicy Bypass -File $UninstallScript
        Write-Host ""
    } else {
        Write-Host "[WARNING] UninstallAddin.ps1 not found, skipping uninstall" -ForegroundColor Yellow
    }
}

# Check if Visual Studio is installed
$VSWhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $VSWhere)) {
    Write-Host "[ERROR] Visual Studio not found. Please install Visual Studio 2022 with Office development tools." -ForegroundColor Red
    exit 1
}

# Find MSBuild path
$VSInstallation = & $VSWhere -latest -requires Microsoft.Component.MSBuild -property installationPath
$MSBuildPath = Join-Path $VSInstallation "MSBuild\Current\Bin\MSBuild.exe"

if (-not (Test-Path $MSBuildPath)) {
    Write-Host "[ERROR] MSBuild not found. Please install Visual Studio build tools." -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Using MSBuild: $MSBuildPath" -ForegroundColor Cyan
Write-Host ""

try {
    # Clean previous build
    Write-Host "[BUILD] Cleaning previous build..." -ForegroundColor Yellow
    & $MSBuildPath $SolutionPath /t:Clean /p:Configuration=$Configuration /verbosity:minimal
    if ($LASTEXITCODE -ne 0) {
        throw "Clean failed with exit code $LASTEXITCODE"
    }

    # Build the project
    Write-Host "[BUILD] Building COM Add-in ($Configuration)..." -ForegroundColor Yellow

    # Disable VSTO installation if already installed to avoid ClickOnce conflicts
    $buildParams = "/t:Build /p:Configuration=$Configuration /p:Platform=`"Any CPU`" /verbosity:minimal"
    if ($isInstalled) {
        # Skip ClickOnce deployment/installation
        $buildParams += " /p:InstallApplication=false /p:BootstrapperEnabled=false"
        Write-Host "[INFO] Build-only mode (no deployment)" -ForegroundColor Gray
    }

    & $MSBuildPath $SolutionPath $buildParams.Split(" ")
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }

    $OutputPath = Join-Path $ProjectPath "bin\$Configuration"
    $DllPath = Join-Path $OutputPath "com-addin.dll"

    if (Test-Path $DllPath) {
        Write-Host ""
        Write-Host "[SUCCESS] Build successful!" -ForegroundColor Green
        Write-Host "[INFO] Output: $OutputPath" -ForegroundColor Cyan

        # Copy manifest to output directory
        $ManifestPath = Join-Path $ProjectPath "com-addin.manifest"
        if (Test-Path $ManifestPath) {
            $OutputManifestPath = Join-Path $OutputPath "com-addin.manifest"
            Copy-Item $ManifestPath $OutputManifestPath -Force
            Write-Host "[INFO] Manifest copied to output directory" -ForegroundColor Cyan
        }

        if ($Register) {
            Write-Host ""
            Write-Host "[REGISTER] Registering COM Add-in..." -ForegroundColor Yellow
            $RegisterScript = Join-Path $ProjectPath "RegisterAddin.ps1"
            if (Test-Path $RegisterScript) {
                & powershell.exe -ExecutionPolicy Bypass -File $RegisterScript -AddInPath $OutputPath
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "[WARNING] Build succeeded but registration failed. Run RegisterAddin.ps1 manually as Administrator." -ForegroundColor Yellow
                }
            } else {
                Write-Host "[WARNING] RegisterAddin.ps1 not found" -ForegroundColor Yellow
            }
        } else {
            Write-Host ""
            Write-Host "To register the add-in, run:" -ForegroundColor Cyan
            Write-Host "  powershell -ExecutionPolicy Bypass -File RegisterAddin.ps1" -ForegroundColor Gray
        }
    } else {
        throw "Build completed but DLL not found at expected location: $DllPath"
    }
} catch {
    Write-Host ""
    Write-Host "[ERROR] Build failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[INFO] Make sure Visual Studio with Office development tools is installed" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Build process completed." -ForegroundColor Gray
