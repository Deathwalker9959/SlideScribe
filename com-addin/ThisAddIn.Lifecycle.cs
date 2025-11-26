using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;

namespace com_addin
{
    public partial class ThisAddIn
    {
        private SlideScribeComBridge _comBridge;
        private static SlideScribeComBridge _staticComBridge;
        private ComBridgePipeServer _pipeServer;
        private ComBridgeWebSocketServer _webSocketServer;

        public PowerPoint.Application PowerPointApplication => this.Application;

        private void InitializeComBridge()
        {
            _comBridge = new SlideScribeComBridge(this);
            _staticComBridge = _comBridge;
        }

        private async Task StartServersAsync()
        {
            _pipeServer = new ComBridgePipeServer(this);
            await _pipeServer.StartAsync();
            SlideScribeLogger.Info("Named Pipe server started: SlideScribeComBridge");

            try
            {
                _webSocketServer = new ComBridgeWebSocketServer(_pipeServer);
                await _webSocketServer.StartAsync();
                SlideScribeLogger.Info("WebSocket server started on http://localhost:8765/slidescribe-com-bridge/");
            }
            catch (HttpListenerException httpEx)
            {
                SlideScribeLogger.Warn($"WebSocket server failed to start: {httpEx.Message}");
                SlideScribeLogger.Info("Named Pipe server is still available for IPC");
                _webSocketServer = null;
            }
        }

        private async Task StopServersAsync()
        {
            if (_webSocketServer != null)
            {
                await _webSocketServer.StopAsync();
                _webSocketServer = null;
            }

            if (_pipeServer != null)
            {
                await _pipeServer.StopAsync();
                _pipeServer = null;
            }
        }

        private async void ThisAddIn_Startup(object sender, EventArgs e)
        {
            try
            {
                ValidateAuthToken();
                InitializeComBridge();
                await StartServersAsync();
                RegisterComBridge();
                AddCustomRibbon();
                SlideScribeLogger.Info("SlideScribe COM Add-in started successfully");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("Error initializing SlideScribe Add-in", ex);
            }
        }

        public async Task<string> DownloadFileToTemp(string url)
        {
            if (!ComBridgeSecurity.IsHttpsUrl(url))
            {
                throw new InvalidOperationException("Only HTTPS downloads are allowed for audio content.");
            }

            using (var httpClient = new HttpClient())
            {
                var response = await httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                var fileName = Path.GetFileName(new Uri(url).LocalPath);
                var tempPath = Path.Combine(Path.GetTempPath(), $"slidescribe_{Guid.NewGuid()}_{fileName}");

                var contentLength = response.Content.Headers.ContentLength;
                if (contentLength.HasValue && contentLength.Value > ComBridgeSecurity.MaxDownloadBytes)
                {
                    throw new InvalidOperationException("Download exceeds maximum allowed size.");
                }

                using (var input = await response.Content.ReadAsStreamAsync())
                using (var output = File.Create(tempPath))
                {
                    var buffer = new byte[8192];
                    long totalRead = 0;
                    int read;
                    while ((read = await input.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    {
                        totalRead += read;
                        if (totalRead > ComBridgeSecurity.MaxDownloadBytes)
                        {
                            throw new InvalidOperationException("Download exceeds maximum allowed size.");
                        }

                        await output.WriteAsync(buffer, 0, read);
                    }
                }

                return tempPath;
            }
        }

        private async void ThisAddIn_Shutdown(object sender, EventArgs e)
        {
            try
            {
                await StopServersAsync();
                UnregisterComBridge();
                _comBridge = null;
                _staticComBridge = null;

                SlideScribeLogger.Info("SlideScribe COM Add-in shut down successfully");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("Error shutting down SlideScribe Add-in", ex);
            }
        }

        private void RegisterComBridge()
        {
            try
            {
                SlideScribeLogger.Info("COM Bridge initialized with Named Pipe server");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Warn($"COM Bridge initialization note: {ex.Message}");
            }
        }

        private void UnregisterComBridge()
        {
            try
            {
                SlideScribeLogger.Info("COM Bridge shutdown completed");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Warn($"COM Bridge cleanup note: {ex.Message}");
            }
        }

        [ComVisible(true)]
        public static SlideScribeComBridge ComBridge => _staticComBridge;

        private void AddCustomRibbon()
        {
            // Custom ribbon would be defined in XML file
            // This is a placeholder for future ribbon customization
        }

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InternalStartup()
        {
            this.Startup += new EventHandler(ThisAddIn_Startup);
            this.Shutdown += new EventHandler(ThisAddIn_Shutdown);
        }

        private static void ValidateAuthToken()
        {
            var token = Environment.GetEnvironmentVariable(ComBridgeSecurity.AuthEnvVar);
            if (string.IsNullOrWhiteSpace(token))
            {
                SlideScribeLogger.Warn($"Authentication token not provided; generating one-time token. Set {ComBridgeSecurity.AuthEnvVar} to supply your own.");
            }
            ComBridgeSecurity.InitializeToken();
        }
    }
}
