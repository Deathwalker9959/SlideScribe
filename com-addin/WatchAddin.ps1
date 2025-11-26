# SlideScribe COM Add-in File Watcher
# Watches for file changes and rebuilds using MSBuild

param(
    [Parameter(Mandatory=$false)]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Continue"
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildScript = Join-Path $ProjectPath "BuildAddin.ps1"

Write-Host "SlideScribe COM Add-in File Watcher" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host "Watching: $ProjectPath" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop watching" -ForegroundColor Yellow
Write-Host ""

# Initial build
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting initial build..." -ForegroundColor Cyan
& powershell.exe -ExecutionPolicy Bypass -File $BuildScript -Configuration $Configuration

# File patterns to watch
$filePatterns = @("*.cs", "*.Designer.cs", "*.xml", "*.csproj", "*.manifest")

# Create file system watcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $ProjectPath
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Debounce timer to avoid multiple rebuilds
$lastBuild = [DateTime]::MinValue
$debounceSeconds = 2

# Define the action to take when a file changes
$onChange = {
    param($source, $e)

    # Check if file matches our patterns
    $fileName = $e.Name
    $shouldRebuild = $false

    foreach ($pattern in $filePatterns) {
        if ($fileName -like $pattern) {
            $shouldRebuild = $true
            break
        }
    }

    # Ignore obj and bin directories
    if ($e.FullPath -match '\\(obj|bin)\\') {
        return
    }

    if ($shouldRebuild) {
        # Debounce: only rebuild if enough time has passed
        $now = Get-Date
        $timeSinceLastBuild = ($now - $script:lastBuild).TotalSeconds

        if ($timeSinceLastBuild -gt $script:debounceSeconds) {
            Write-Host ""
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] File changed: $fileName" -ForegroundColor Yellow
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Rebuilding..." -ForegroundColor Cyan

            $script:lastBuild = $now

            # Run build script
            & powershell.exe -ExecutionPolicy Bypass -File $script:BuildScript -Configuration $script:Configuration

            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ Rebuild successful" -ForegroundColor Green
            } else {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ Rebuild failed" -ForegroundColor Red
            }
            Write-Host "Watching for changes..." -ForegroundColor Cyan
        }
    }
}

# Register event handlers
$handlers = @()
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $onChange
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $onChange
$handlers += Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action $onChange

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Watching for changes..." -ForegroundColor Cyan

try {
    # Keep script running
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    # Cleanup
    Write-Host ""
    Write-Host "Stopping file watcher..." -ForegroundColor Yellow
    $handlers | ForEach-Object { Unregister-Event -SourceIdentifier $_.Name }
    $watcher.Dispose()
    Write-Host "File watcher stopped." -ForegroundColor Gray
}
