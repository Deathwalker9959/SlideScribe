# SlideScribe PowerPoint COM Add-in

Advanced audio embedding and media manipulation capabilities for PowerPoint that go beyond Office.js limitations.

## Features

- **Direct PowerPoint API Access**: Full access to PowerPoint object model
- **Named Pipe IPC**: Real-time communication with Office.js add-in
- **Advanced Audio Embedding**: Precise control over media objects
- **Cross-Version Compatibility**: Works with PowerPoint 2013 and later
- **WebSocket Bridge**: Modern IPC communication protocol

## Prerequisites

1. **Visual Studio 2022** with Office development tools
2. **.NET Framework 4.8** (installed with Visual Studio)
3. **Microsoft PowerPoint** (2013 or later)
4. **Administrator privileges** (for registration)

## Building the Add-in

### Option 1: Using Visual Studio

1. Open `com-addin.sln` in Visual Studio 2022
2. Select `Release` configuration
3. Build → Build Solution (Ctrl+Shift+B)
4. Run `RegisterAddin.ps1` as Administrator

### Option 2: Using PowerShell Scripts

```powershell
# Build only
.\BuildAddin.ps1

# Build and register
.\BuildAddin.ps1 -Register

# Register separately (if already built)
.\RegisterAddin.ps1
```

## Installation

1. **Build the project** using one of the methods above
2. **Register the COM Add-in** as Administrator:
   ```powershell
   powershell -ExecutionPolicy Bypass -File RegisterAddin.ps1
   ```
3. **Enable in PowerPoint**:
   - Open PowerPoint
   - File → Options → Add-ins
   - Select "COM Add-ins" from dropdown
   - Click "Go..."
   - Check "SlideScribe Media COM Add-in"
   - Click OK

## Usage

Once installed, the COM Add-in will:

1. **Auto-start** when PowerPoint launches
2. **Create Named Pipe server** for IPC communication
3. **Expose advanced audio embedding** capabilities
4. **Communicate with Office.js add-in** via WebSocket bridge

## Architecture

```
[Office.js Add-in] ←→ [WebSocket] ←→ [Bridge Server] ←→ [Named Pipe] ←→ [COM Add-in]
```

### Components

1. **COM Add-in** (`ThisAddIn.cs`): PowerPoint integration and Named Pipe server
2. **Office.js Bridge** (`comBridge.ts`): WebSocket client for TypeScript
3. **WebSocket Bridge Server**: Protocol translation (Node.js/Express)
4. **Registration Scripts**: PowerShell scripts for deployment

## COM Bridge API

The Named Pipe server exposes these methods:

- `embedAudioFromFile(string audioFilePath, int slideNumber)`
- `getSlideAudioInfo(int slideNumber)` → string
- `setAudioSettings(int slideNumber, bool autoPlay, bool hideWhilePlaying, float volume)`
- `removeAudioFromSlides(string slideNumbers)`
- `testConnection()` → bool

## Message Protocol

**Request:**
```json
{
  "id": "embed_1234567890",
  "method": "embedAudioFromFile",
  "parameters": {
    "audioFilePath": "C:/path/to/audio.wav",
    "slideNumber": 3
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Response:**
```json
{
  "id": "embed_1234567890",
  "success": true,
  "result": "Audio embedded successfully",
  "timestamp": "2024-01-01T12:00:01.000Z"
}
```

## Troubleshooting

### Add-in doesn't appear in PowerPoint

1. **Check registration**: Run `RegisterAddin.ps1` as Administrator
2. **Verify build**: Ensure `com-addin.dll` exists in `bin/Release/`
3. **Check trust settings**: PowerPoint may block unsigned add-ins
4. **Look in Event Viewer**: Windows Application logs for errors

### COM Bridge not working

1. **Check Named Pipe**: Use `Get-ChildItem \\.\pipe\` in PowerShell
2. **PowerPoint context**: Ensure add-in is running in PowerPoint, not browser
3. **WebSocket bridge**: Verify bridge server is running on port 8765

### Build errors

1. **Visual Studio**: Ensure Office development tools are installed
2. **.NET Framework**: Verify .NET Framework 4.8 is installed
3. **References**: Check Office and PowerPoint references in project

## Uninstalling

```powershell
# Unregister the add-in
.\RegisterAddin.ps1 -Unregister

# Or manually remove from PowerPoint:
# File → Options → Add-ins → COM Add-ins → Go...
# Uncheck "SlideScribe Media COM Add-in"
```

## Development Notes

- **No external dependencies**: Uses only built-in .NET Framework libraries
- **Custom JSON**: Simple JSON implementation for compatibility
- **Version-agnostic**: Works across multiple PowerPoint versions
- **Thread-safe**: Async/await patterns for non-blocking operations

## Support

For issues and support:
- Check Event Viewer for detailed error messages
- Verify all prerequisites are installed
- Ensure running with appropriate permissions