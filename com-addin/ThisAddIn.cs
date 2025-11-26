using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml.Linq;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;
using Office = Microsoft.Office.Core;

namespace com_addin
{
    /// <summary>
    /// Simple JSON serialization helper for .NET Framework 4.8
    /// </summary>
    public static class SimpleJson
    {
        public static string Serialize(object obj)
        {
            var sb = new StringBuilder();
            SerializeObject(obj, sb);
            return sb.ToString();
        }

        private static void SerializeObject(object obj, StringBuilder sb)
        {
            if (obj == null)
            {
                sb.Append("null");
                return;
            }

            var type = obj.GetType();
            if (type == typeof(string))
            {
                sb.Append($"\"{obj.ToString().Replace("\"", "\\\"")}\"");
            }
            else if (type == typeof(int) || type == typeof(float) || type == typeof(double) || type == typeof(bool))
            {
                sb.Append(obj.ToString());
            }
            else if (type == typeof(ComBridgeMessage))
            {
                var msg = (ComBridgeMessage)obj;
                sb.Append("{");
                sb.Append($"\"id\":\"{msg.Id}\",");
                sb.Append($"\"method\":\"{msg.Method}\",");
                sb.Append("\"parameters\":{");
                SerializeDictionary(msg.Parameters, sb);
                sb.Append("},");
                sb.Append($"\"timestamp\":\"{msg.Timestamp:yyyy-MM-ddTHH:mm:ss.fffZ}\"");
                sb.Append("}");
            }
            else if (type == typeof(ComBridgeResponse))
            {
                var resp = (ComBridgeResponse)obj;
                sb.Append("{");
                sb.Append($"\"id\":\"{resp.Id}\",");
                sb.Append($"\"success\":{resp.Success.ToString().ToLower()},");
                if (resp.Result != null)
                {
                    sb.Append($"\"result\":\"{resp.Result}\",");
                }
                if (!string.IsNullOrEmpty(resp.Error))
                {
                    sb.Append($"\"error\":\"{resp.Error}\",");
                }
                sb.Append($"\"timestamp\":\"{resp.Timestamp:yyyy-MM-ddTHH:mm:ss.fffZ}\"");
                sb.Append("}");
            }
        }

        private static void SerializeDictionary(Dictionary<string, object> dict, StringBuilder sb)
        {
            sb.Append("{");
            bool first = true;
            foreach (var kvp in dict)
            {
                if (!first) sb.Append(",");
                first = false;
                sb.Append($"\"{kvp.Key}\":");
                SerializeObject(kvp.Value, sb);
            }
            sb.Append("}");
        }

        public static T Deserialize<T>(string json) where T : class, new()
        {
            // Simple parsing for our specific use case
            if (typeof(T) == typeof(ComBridgeMessage))
            {
                return ParseMessage(json) as T;
            }
            else if (typeof(T) == typeof(ComBridgeResponse))
            {
                return ParseResponse(json) as T;
            }
            return new T();
        }

        private static ComBridgeMessage ParseMessage(string json)
        {
            var message = new ComBridgeMessage();

            // Parse method
            var methodMatch = System.Text.RegularExpressions.Regex.Match(json, "\"method\":\"([^\"]+)\"");
            if (methodMatch.Success)
            {
                message.Method = methodMatch.Groups[1].Value;
            }

            // Parse id
            var idMatch = System.Text.RegularExpressions.Regex.Match(json, "\"id\":\"([^\"]+)\"");
            if (idMatch.Success)
            {
                message.Id = idMatch.Groups[1].Value;
            }

            // Parse parameters object
            var parametersMatch = System.Text.RegularExpressions.Regex.Match(json, "\"parameters\":\\s*\\{([^}]+)\\}");
            if (parametersMatch.Success)
            {
                var parametersContent = parametersMatch.Groups[1].Value;

                // Extract each parameter key-value pair
                var paramMatches = System.Text.RegularExpressions.Regex.Matches(parametersContent, "\"([^\"]+)\":\\s*([^,}]+)");
                foreach (System.Text.RegularExpressions.Match paramMatch in paramMatches)
                {
                    if (paramMatch.Success && paramMatch.Groups.Count >= 3)
                    {
                        var key = paramMatch.Groups[1].Value;
                        var value = paramMatch.Groups[2].Value.Trim();

                        // Remove quotes from string values
                        if (value.StartsWith("\"") && value.EndsWith("\""))
                        {
                            value = value.Substring(1, value.Length - 2);
                        }

                        // Try to parse as number
                        if (int.TryParse(value, out int intValue))
                        {
                            message.Parameters[key] = intValue;
                        }
                        else if (double.TryParse(value, out double doubleValue))
                        {
                            message.Parameters[key] = doubleValue;
                        }
                        else if (value == "true" || value == "false")
                        {
                            message.Parameters[key] = value == "true";
                        }
                        else
                        {
                            message.Parameters[key] = value;
                        }
                    }
                }
            }

            return message;
        }

        private static ComBridgeResponse ParseResponse(string json)
        {
            var response = new ComBridgeResponse();

            var idMatch = System.Text.RegularExpressions.Regex.Match(json, "\"id\":\"([^\"]+)\"");
            if (idMatch.Success)
            {
                response.Id = idMatch.Groups[1].Value;
            }

            var successMatch = System.Text.RegularExpressions.Regex.Match(json, "\"success\":(true|false)");
            if (successMatch.Success)
            {
                response.Success = successMatch.Groups[1].Value == "true";
            }

            var resultMatch = System.Text.RegularExpressions.Regex.Match(json, "\"result\":\"([^\"]+)\"");
            if (resultMatch.Success)
            {
                response.Result = resultMatch.Groups[1].Value;
            }

            var errorMatch = System.Text.RegularExpressions.Regex.Match(json, "\"error\":\"([^\"]+)\"");
            if (errorMatch.Success)
            {
                response.Error = errorMatch.Groups[1].Value;
            }

            return response;
        }
    }

    /// <summary>
    /// Simple WebSocket server for COM-Office.js communication
    /// </summary>
    public class ComBridgeWebSocketServer
    {
        private readonly HttpListener _httpListener;
        private readonly ComBridgePipeServer _pipeServer;
        private CancellationTokenSource _cancellationTokenSource;
        private Task _serverTask;
        private const string WebSocketPath = "/slidescribe-com-bridge";
        private const int Port = 8765;

        public ComBridgeWebSocketServer(ComBridgePipeServer pipeServer)
        {
            _pipeServer = pipeServer;
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add($"http://localhost:{Port}{WebSocketPath}/");
        }

        public Task StartAsync()
        {
            try
            {
                _cancellationTokenSource = new CancellationTokenSource();
                _httpListener.Start();
                _serverTask = Task.Run(ListenForClientsAsync, _cancellationTokenSource.Token);

                System.Diagnostics.Debug.WriteLine($"🌐 WebSocket server started on http://localhost:{Port}{WebSocketPath}/");
                return Task.CompletedTask;
            }
            catch (HttpListenerException ex)
            {
                System.Diagnostics.Debug.WriteLine($"❌ WebSocket server failed to start: {ex.Message}");
                throw;
            }
        }

        public async Task StopAsync()
        {
            try
            {
                _cancellationTokenSource?.Cancel();
                _httpListener?.Stop();

                if (_serverTask != null)
                {
                    await _serverTask;
                }

                System.Diagnostics.Debug.WriteLine("🌐 WebSocket server stopped");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"⚠️ Error stopping WebSocket server: {ex.Message}");
            }
        }

        private async Task ListenForClientsAsync()
        {
            while (!_cancellationTokenSource.Token.IsCancellationRequested)
            {
                try
                {
                    var context = await _httpListener.GetContextAsync();

                    if (context.Request.IsWebSocketRequest)
                    {
                        _ = Task.Run(() => HandleWebSocketAsync(context), _cancellationTokenSource.Token);
                    }
                    else
                    {
                        context.Response.StatusCode = 400;
                        context.Response.Close();
                    }
                }
                catch (Exception ex) when (!_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    System.Diagnostics.Debug.WriteLine($"⚠️ WebSocket listener error: {ex.Message}");
                    await Task.Delay(1000, _cancellationTokenSource.Token);
                }
            }
        }

        private async Task HandleWebSocketAsync(HttpListenerContext context)
        {
            try
            {
                var webSocketContext = await context.AcceptWebSocketAsync(subProtocol: null);
                var webSocket = webSocketContext.WebSocket;

                System.Diagnostics.Debug.WriteLine("🔗 WebSocket client connected");

                var buffer = new byte[4096];

                while (webSocket.State == WebSocketState.Open && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    try
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), _cancellationTokenSource.Token);

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            var messageJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
                            System.Diagnostics.Debug.WriteLine($"📨 WebSocket received: {messageJson}");

                            var message = SimpleJson.Deserialize<ComBridgeMessage>(messageJson);

                            if (message != null)
                            {
                                System.Diagnostics.Debug.WriteLine($"🔍 Parsed COM Bridge message: {message.Method} (ID: {message.Id})");

                                // Forward message to Named Pipe server
                                var response = await _pipeServer.ProcessMessageAsync(message);

                                System.Diagnostics.Debug.WriteLine($"📤 COM Bridge response: Success={response.Success}, Result={response.Result}");

                                // Send response back via WebSocket
                                var responseJson = SimpleJson.Serialize(response);
                                System.Diagnostics.Debug.WriteLine($"📤 Sending WebSocket response: {responseJson}");
                                var responseBuffer = Encoding.UTF8.GetBytes(responseJson);

                                await webSocket.SendAsync(
                                    new ArraySegment<byte>(responseBuffer),
                                    WebSocketMessageType.Text,
                                    true,
                                    _cancellationTokenSource.Token);
                            }
                            else
                            {
                                System.Diagnostics.Debug.WriteLine("❌ Failed to parse COM Bridge message");
                            }
                        }
                        else if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                            break;
                        }
                    }
                    catch (WebSocketException ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"⚠️ WebSocket communication error: {ex.Message}");
                        break;
                    }
                }

                System.Diagnostics.Debug.WriteLine("🔌 WebSocket client disconnected");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"❌ WebSocket handler error: {ex.Message}");
            }
            finally
            {
                try
                {
                    context.Response.Close();
                }
                catch { /* Ignore cleanup errors */ }
            }
        }
    }

    /// <summary>
    /// Named Pipe communication message types
    /// </summary>
    public class ComBridgeMessage
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Method { get; set; }
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class ComBridgeResponse
    {
        public string Id { get; set; }
        public bool Success { get; set; }
        public object Result { get; set; }
        public string Error { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Named Pipe server for COM-Office.js communication
    /// </summary>
    public class ComBridgePipeServer
    {
        private const string PipeName = "SlideScribeComBridge";
        private ThisAddIn _addin;
        private CancellationTokenSource _cancellationTokenSource;
        private Task _serverTask;

        public ComBridgePipeServer(ThisAddIn addin)
        {
            _addin = addin;
            _cancellationTokenSource = new CancellationTokenSource();
        }

        public Task StartAsync()
        {
            _serverTask = Task.Run(() => ListenForClientsAsync(_cancellationTokenSource.Token));
            return Task.CompletedTask;
        }

        public async Task StopAsync()
        {
            _cancellationTokenSource.Cancel();
            if (_serverTask != null)
            {
                await _serverTask;
            }
        }

        private async Task ListenForClientsAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    using (var namedPipeServer = new NamedPipeServerStream(PipeName, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Message))
                    {
                        // Wait for client connection
                        await namedPipeServer.WaitForConnectionAsync(cancellationToken);

                        // Handle client request
                        _ = Task.Run(async () => await HandleClientAsync(namedPipeServer), cancellationToken);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Pipe server error: {ex.Message}");
                    await Task.Delay(1000, cancellationToken); // Wait before retry
                }
            }
        }

        private async Task HandleClientAsync(NamedPipeServerStream pipeStream)
        {
            try
            {
                using (var reader = new StreamReader(pipeStream))
                using (var writer = new StreamWriter(pipeStream) { AutoFlush = true })
                {
                    // Read message
                    var messageJson = await reader.ReadToEndAsync();
                    var message = SimpleJson.Deserialize<ComBridgeMessage>(messageJson);

                    if (message != null)
                    {
                        // Process request
                        var response = await ProcessMessageAsync(message);

                        // Send response
                        var responseJson = SimpleJson.Serialize(response);
                        await writer.WriteAsync(responseJson);
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error handling client: {ex.Message}");
            }
        }

        public async Task<ComBridgeResponse> ProcessMessageAsync(ComBridgeMessage message)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"📨 Processing COM Bridge message: {message.Method} (ID: {message.Id})");

                switch (message.Method.ToLower())
                {
                    case "embedaudiofromfile":
                        var audioPath = message.Parameters.ContainsKey("audioFilePath") ? message.Parameters["audioFilePath"]?.ToString() : null;
                        var slideNumber = Convert.ToInt32(message.Parameters.ContainsKey("slideNumber") ? message.Parameters["slideNumber"] : -1);

                        System.Diagnostics.Debug.WriteLine($"🎵 EmbedAudioFromFile: path='{audioPath}', slide={slideNumber}");
                        System.Diagnostics.Debug.WriteLine($"📋 Parameters count: {message.Parameters.Count}");
                        foreach (var param in message.Parameters)
                        {
                            System.Diagnostics.Debug.WriteLine($"📋   {param.Key} = {param.Value}");
                        }

                        if (string.IsNullOrEmpty(audioPath))
                        {
                            return new ComBridgeResponse { Id = message.Id, Success = false, Error = "Audio file path is null or empty" };
                        }

                        // If it's an HTTP URL, download it first
                        string localFilePath = audioPath;
                        if (audioPath.StartsWith("http://") || audioPath.StartsWith("https://"))
                        {
                            try
                            {
                                localFilePath = await _addin.DownloadFileToTemp(audioPath);
                                System.Diagnostics.Debug.WriteLine($"📥 Downloaded audio to: {localFilePath}");
                            }
                            catch (Exception ex)
                            {
                                return new ComBridgeResponse { Id = message.Id, Success = false, Error = $"Failed to download audio: {ex.Message}" };
                            }
                        }

                        await Task.Run(() => _addin.EmbedAudioFromFile(localFilePath, slideNumber));
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = "Audio embedded successfully" };

                    case "getslideaudioinfo":
                        var slideNum = Convert.ToInt32(message.Parameters.ContainsKey("slideNumber") ? message.Parameters["slideNumber"] : 1);
                        var info = await Task.Run(() => _addin.GetSlideAudioInfo(slideNum));
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = info };

                    case "setaudiosettings":
                        var slide = Convert.ToInt32(message.Parameters.ContainsKey("slideNumber") ? message.Parameters["slideNumber"] : 1);
                        var autoPlay = Convert.ToBoolean(message.Parameters.ContainsKey("autoPlay") ? message.Parameters["autoPlay"] : true);
                        var hideWhilePlaying = Convert.ToBoolean(message.Parameters.ContainsKey("hideWhilePlaying") ? message.Parameters["hideWhilePlaying"] : true);
                        var volume = Convert.ToSingle(message.Parameters.ContainsKey("volume") ? message.Parameters["volume"] : 1.0f);
                        await Task.Run(() => _addin.SetAudioSettings(slide, autoPlay, hideWhilePlaying, volume));
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = "Audio settings updated" };

                    case "removeaudiofromslides":
                        var slides = message.Parameters.ContainsKey("slideNumbers") ? message.Parameters["slideNumbers"]?.ToString() : "all";
                        await Task.Run(() => _addin.RemoveAudioFromSlides(slides));
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = "Audio removed successfully" };

                    case "testconnection":
                        var isConnected = _addin.PowerPointApplication != null;
                        System.Diagnostics.Debug.WriteLine($"🔍 Test connection result: {isConnected} (PowerPoint available: {_addin.PowerPointApplication != null})");
                        var response = new ComBridgeResponse { Id = message.Id, Success = true, Result = isConnected };
                        System.Diagnostics.Debug.WriteLine($"📤 Sending response: Success={response.Success}, Result={response.Result}");
                        return response;

                    default:
                        return new ComBridgeResponse { Id = message.Id, Success = false, Error = $"Unknown method: {message.Method}" };
                }
            }
            catch (Exception ex)
            {
                return new ComBridgeResponse { Id = message.Id, Success = false, Error = ex.Message };
            }
        }
    }

    /// <summary>
    /// COM Bridge interface for Office.js integration
    /// </summary>
    [ComVisible(true)]
    [Guid("87654321-4321-8765-2109-876543210fed")]
    [InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface ISlideScribeComBridge
    {
        void EmbedAudioFromFile(string audioFilePath, int slideNumber);
        string GetSlideAudioInfo(int slideNumber);
        void SetAudioSettings(int slideNumber, bool autoPlay, bool hideWhilePlaying, float volume);
        void RemoveAudioFromSlides(string slideNumbers);
        bool TestConnection();
    }

    /// <summary>
    /// COM Bridge implementation for Office.js communication
    /// </summary>
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class SlideScribeComBridge : ISlideScribeComBridge
    {
        private ThisAddIn _addin;

        public SlideScribeComBridge(ThisAddIn addin)
        {
            _addin = addin;
        }

        public void EmbedAudioFromFile(string audioFilePath, int slideNumber)
        {
            try
            {
                _addin.EmbedAudioFromFile(audioFilePath, slideNumber);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error embedding audio: {ex.Message}", "SlideScribe COM Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                throw;
            }
        }

        public string GetSlideAudioInfo(int slideNumber)
        {
            try
            {
                return _addin.GetSlideAudioInfo(slideNumber);
            }
            catch (Exception ex)
            {
                return $"Error: {ex.Message}";
            }
        }

        public void SetAudioSettings(int slideNumber, bool autoPlay, bool hideWhilePlaying, float volume)
        {
            try
            {
                _addin.SetAudioSettings(slideNumber, autoPlay, hideWhilePlaying, volume);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error setting audio: {ex.Message}", "SlideScribe COM Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                throw;
            }
        }

        public void RemoveAudioFromSlides(string slideNumbers)
        {
            try
            {
                _addin.RemoveAudioFromSlides(slideNumbers);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error removing audio: {ex.Message}", "SlideScribe COM Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                throw;
            }
        }

        public bool TestConnection()
        {
            try
            {
                return _addin != null && _addin.Application != null;
            }
            catch
            {
                return false;
            }
        }
    }

    public partial class ThisAddIn
    {
        private SlideScribeComBridge _comBridge;
        private static SlideScribeComBridge _staticComBridge;
        private ComBridgePipeServer _pipeServer;
        private ComBridgeWebSocketServer _webSocketServer;

        // Property to access PowerPoint Application
        public Microsoft.Office.Interop.PowerPoint.Application PowerPointApplication => this.Application;

        private async void ThisAddIn_Startup(object sender, System.EventArgs e)
        {
            try
            {
                // Initialize COM Bridge
                _comBridge = new SlideScribeComBridge(this);
                _staticComBridge = _comBridge;

                // Initialize and start Named Pipe server
                _pipeServer = new ComBridgePipeServer(this);
                await _pipeServer.StartAsync();

                System.Diagnostics.Debug.WriteLine("📡 Named Pipe server started: SlideScribeComBridge");

                // Try to start WebSocket server (may fail if port in use or no admin rights)
                try
                {
                    _webSocketServer = new ComBridgeWebSocketServer(_pipeServer);
                    await _webSocketServer.StartAsync();
                    System.Diagnostics.Debug.WriteLine("🌐 WebSocket server started on http://localhost:8765/slidescribe-com-bridge/");
                }
                catch (HttpListenerException httpEx)
                {
                    System.Diagnostics.Debug.WriteLine($"⚠️ WebSocket server failed to start: {httpEx.Message}");
                    System.Diagnostics.Debug.WriteLine("⚠️ Named Pipe server is still available for IPC");
                    // Continue without WebSocket - Named Pipe is still functional
                }

                // Register COM Bridge for Office.js access
                RegisterComBridge();

                // Add custom ribbon UI
                AddCustomRibbon();

                // Show welcome message
                string webSocketStatus = _webSocketServer != null ?
                    "WebSocket server: http://localhost:8765/slidescribe-com-bridge/" :
                    "WebSocket server: Not started (use Named Pipe instead)";

                MessageBox.Show("SlideScribe Media COM Add-in loaded successfully!\n\n" +
                              "Features:\n" +
                              "• Advanced audio embedding via Named Pipe IPC\n" +
                              "• Direct media object manipulation\n" +
                              "• Enhanced audio settings control\n" +
                              "• Real-time communication with Office.js\n\n" +
                              $"Named Pipe: SlideScribeComBridge\n{webSocketStatus}",
                              "SlideScribe Media COM Add-in",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Information);

                System.Diagnostics.Debug.WriteLine("🚀 SlideScribe COM Add-in started successfully");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error initializing SlideScribe Add-in:\n\n{ex.Message}\n\nStack Trace:\n{ex.StackTrace}",
                              "SlideScribe Error",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
                System.Diagnostics.Debug.WriteLine($"❌ Add-in startup failed: {ex.Message}\n{ex.StackTrace}");
            }
        }

        public async Task<string> DownloadFileToTemp(string url)
        {
            return await Task.Run(async () =>
            {
                using (var httpClient = new System.Net.Http.HttpClient())
                {
                    var response = await httpClient.GetAsync(url);
                    response.EnsureSuccessStatusCode();

                    var fileName = Path.GetFileName(new Uri(url).LocalPath);
                    var tempPath = Path.Combine(Path.GetTempPath(), $"slidescribe_{Guid.NewGuid()}_{fileName}");

                    var fileBytes = await response.Content.ReadAsByteArrayAsync();
                    File.WriteAllBytes(tempPath, fileBytes);

                    return tempPath;
                }
            });
        }

        private async void ThisAddIn_Shutdown(object sender, System.EventArgs e)
        {
            try
            {
                // Stop WebSocket server
                if (_webSocketServer != null)
                {
                    await _webSocketServer.StopAsync();
                    _webSocketServer = null;
                }

                // Stop Named Pipe server
                if (_pipeServer != null)
                {
                    await _pipeServer.StopAsync();
                    _pipeServer = null;
                }

                UnregisterComBridge();
                _comBridge = null;
                _staticComBridge = null;

                System.Diagnostics.Debug.WriteLine("🛑 SlideScribe COM Add-in shut down successfully");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error shutting down SlideScribe Add-in: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        #region COM Bridge Registration

        private void RegisterComBridge()
        {
            try
            {
                // COM Bridge is accessible via VSTO runtime
                // The Named Pipe server will handle communication with Office.js
                System.Diagnostics.Debug.WriteLine("COM Bridge initialized with Named Pipe server");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"COM Bridge initialization note: {ex.Message}");
            }
        }

        private void UnregisterComBridge()
        {
            try
            {
                // Clean up is handled by VSTO runtime
                System.Diagnostics.Debug.WriteLine("COM Bridge shutdown completed");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"COM Bridge cleanup note: {ex.Message}");
            }
        }

        /// <summary>
        /// Static access to COM Bridge for Office.js integration
        /// </summary>
        [ComVisible(true)]
        public static SlideScribeComBridge ComBridge => _staticComBridge;

        #endregion

        #region Advanced Media Manipulation Methods

        /// <summary>
        /// Embed audio file into specified slide with advanced options
        /// </summary>
        public void EmbedAudioFromFile(string audioFilePath, int slideNumber = -1)
        {
            try
            {
                if (!File.Exists(audioFilePath))
                {
                    throw new FileNotFoundException($"Audio file not found: {audioFilePath}");
                }

                PowerPoint.Slide targetSlide;

                if (slideNumber > 0)
                {
                    targetSlide = PowerPointApplication.ActivePresentation.Slides[slideNumber];
                }
                else
                {
                    targetSlide = PowerPointApplication.ActiveWindow.View.Slide;
                }

                if (targetSlide == null)
                {
                    throw new InvalidOperationException("No active slide found");
                }

                // Get slide dimensions for positioning
                float slideWidth = PowerPointApplication.ActivePresentation.PageSetup.SlideWidth;
                float slideHeight = PowerPointApplication.ActivePresentation.PageSetup.SlideHeight;

                // Add audio as media object - check if slide has shapes for positioning
                float leftPos = 50;
                float topPos = 50;

                if (targetSlide.Shapes.Count >= 1)
                {
                    leftPos = targetSlide.Shapes[1].Left + 50;
                    topPos = targetSlide.Shapes[1].Top + 50;
                }

                // Try to add audio using PowerPoint API
                PowerPoint.Shape audioShape = null;
                Exception lastException = null;
                string attemptedMethods = "";

                System.Diagnostics.Debug.WriteLine($"🎵 Attempting to embed audio file: {audioFilePath}");
                System.Diagnostics.Debug.WriteLine($"📍 File exists: {File.Exists(audioFilePath)}");
                System.Diagnostics.Debug.WriteLine($"📊 Slide number: {slideNumber}, Slide ID: {targetSlide.SlideID}");

                // Try Method 1: Direct AddMediaObject2 call with full signature
                // AddMediaObject2(FileName, LinkToFile, SaveWithDocument, Left, Top)
                try
                {
                    attemptedMethods += "AddMediaObject2(filename, link, save, left, top); ";
                    System.Diagnostics.Debug.WriteLine("🔧 Trying AddMediaObject2 with 5 parameters...");
                    audioShape = targetSlide.Shapes.AddMediaObject2(
                        audioFilePath,
                        Office.MsoTriState.msoFalse,  // LinkToFile = False (embed the file)
                        Office.MsoTriState.msoTrue,   // SaveWithDocument = True
                        leftPos,
                        topPos
                    );
                    System.Diagnostics.Debug.WriteLine("✅ AddMediaObject2 succeeded!");
                }
                catch (Exception ex1)
                {
                    System.Diagnostics.Debug.WriteLine($"❌ AddMediaObject2(5 params) failed: {ex1.Message}");
                    lastException = ex1;

                    // Try Method 2: Try with default position (0, 0)
                    try
                    {
                        attemptedMethods += "AddMediaObject2(filename, link, save, 0, 0); ";
                        System.Diagnostics.Debug.WriteLine("🔧 Trying AddMediaObject2 with position 0,0...");
                        audioShape = targetSlide.Shapes.AddMediaObject2(
                            audioFilePath,
                            Office.MsoTriState.msoFalse,
                            Office.MsoTriState.msoTrue,
                            0,
                            0
                        );
                        System.Diagnostics.Debug.WriteLine("✅ AddMediaObject2(0,0) succeeded!");
                    }
                    catch (Exception ex2)
                    {
                        System.Diagnostics.Debug.WriteLine($"❌ AddMediaObject2(0,0) failed: {ex2.Message}");
                        lastException = ex2;

                        // Try Method 3: Use reflection for older PowerPoint versions
                        try
                        {
                            attemptedMethods += "AddMediaObject(filename); ";
                            System.Diagnostics.Debug.WriteLine("🔧 Trying reflection for AddMediaObject...");
                            var shapes = targetSlide.Shapes;
                            var mediaObjectType = typeof(PowerPoint.Shapes);
                            var addMediaMethod = mediaObjectType.GetMethod("AddMediaObject", new[] { typeof(string) });
                            if (addMediaMethod != null)
                            {
                                audioShape = addMediaMethod.Invoke(shapes, new object[] { audioFilePath }) as PowerPoint.Shape;
                                System.Diagnostics.Debug.WriteLine("✅ AddMediaObject succeeded!");
                            }
                            else
                            {
                                throw new Exception("AddMediaObject method not found via reflection");
                            }
                        }
                        catch (Exception ex3)
                        {
                            System.Diagnostics.Debug.WriteLine($"❌ Reflection method failed: {ex3.Message}");
                            lastException = ex3;
                        }
                    }
                }

                if (audioShape == null)
                {
                    var detailedError = $"Failed to add media object. Attempted: {attemptedMethods}. " +
                                       $"Last error: {lastException?.Message ?? "Unknown"}. " +
                                       $"Inner exception: {lastException?.InnerException?.Message ?? "None"}. " +
                                       $"File: {audioFilePath}, Exists: {File.Exists(audioFilePath)}";
                    System.Diagnostics.Debug.WriteLine($"❌ All embedding methods failed: {detailedError}");
                    throw new Exception(detailedError);
                }

                // Configure advanced audio properties
                System.Diagnostics.Debug.WriteLine($"🎨 Configuring audio shape properties...");

                try
                {
                    // Position audio icon in bottom-right corner of slide (visible but unobtrusive)
                    audioShape.Left = slideWidth - 100;
                    audioShape.Top = slideHeight - 100;
                    audioShape.Width = 32;  // Small icon size
                    audioShape.Height = 32;

                    System.Diagnostics.Debug.WriteLine($"📍 Audio positioned at ({audioShape.Left}, {audioShape.Top})");

                    // Configure audio playback settings
                    if (audioShape.MediaFormat != null)
                    {
                        var mediaFormat = audioShape.MediaFormat;
                        System.Diagnostics.Debug.WriteLine("🔧 Configuring MediaFormat properties...");

                        // Use reflection for PowerPoint version compatibility
                        var playAutoProperty = mediaFormat.GetType().GetProperty("PlayOnEntry");
                        if (playAutoProperty != null && playAutoProperty.CanWrite)
                        {
                            playAutoProperty.SetValue(mediaFormat, Office.MsoTriState.msoTrue);
                            System.Diagnostics.Debug.WriteLine("✅ Set PlayOnEntry = True");
                        }
                        else
                        {
                            System.Diagnostics.Debug.WriteLine("⚠️ PlayOnEntry property not found");
                        }

                        // Keep audio icon visible during slideshow
                        var hideProperty = mediaFormat.GetType().GetProperty("HideDuringShow");
                        if (hideProperty != null && hideProperty.CanWrite)
                        {
                            hideProperty.SetValue(mediaFormat, Office.MsoTriState.msoFalse);
                            System.Diagnostics.Debug.WriteLine("✅ Set HideDuringShow = False");
                        }

                        // Set volume to 100%
                        var volumeProperty = mediaFormat.GetType().GetProperty("Volume");
                        if (volumeProperty != null && volumeProperty.CanWrite)
                        {
                            volumeProperty.SetValue(mediaFormat, 1.0f);
                            System.Diagnostics.Debug.WriteLine("✅ Set Volume = 1.0");
                        }
                    }
                    else
                    {
                        System.Diagnostics.Debug.WriteLine("⚠️ MediaFormat is null");
                    }

                    // Unique name for identification
                    audioShape.Name = $"SlideScribeAudio_{Guid.NewGuid():N}";
                    System.Diagnostics.Debug.WriteLine($"🏷️ Audio shape named: {audioShape.Name}");
                }
                catch (Exception configEx)
                {
                    System.Diagnostics.Debug.WriteLine($"⚠️ Audio configuration failed: {configEx.Message}");
                    // Continue - audio is still embedded, just not optimally configured
                }

                System.Diagnostics.Debug.WriteLine($"Successfully embedded audio: {audioFilePath} into slide {slideNumber}");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to embed audio: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Get detailed audio information from slide
        /// </summary>
        public string GetSlideAudioInfo(int slideNumber)
        {
            try
            {
                PowerPoint.Slide slide = PowerPointApplication.ActivePresentation.Slides[slideNumber];
                var audioInfo = new List<string>();

                foreach (PowerPoint.Shape shape in slide.Shapes)
                {
                    // Check for media shapes (use numeric constants for compatibility)
                    if (shape.Type == Office.MsoShapeType.msoMedia || shape.Type.ToString().Contains("Media"))
                    {
                        audioInfo.Add($"Audio Shape: {shape.Name}");
                        audioInfo.Add($"  Type: {shape.Type}");

                        if (shape.MediaFormat != null)
                        {
                            try
                            {
                                // Use reflection for version compatibility
                                var mediaFormat = shape.MediaFormat;
                                var playAutoProperty = mediaFormat.GetType().GetProperty("PlayAutomatically");
                                if (playAutoProperty != null)
                                {
                                    audioInfo.Add($"  Auto-play: {playAutoProperty.GetValue(mediaFormat)}");
                                }

                                var hideProperty = mediaFormat.GetType().GetProperty("HideWhileNotPlaying");
                                if (hideProperty != null)
                                {
                                    audioInfo.Add($"  Hide while playing: {hideProperty.GetValue(mediaFormat)}");
                                }
                            }
                            catch (Exception formatEx)
                            {
                                audioInfo.Add($"  MediaFormat access: {formatEx.Message}");
                            }
                        }

                        audioInfo.Add($"  Position: ({shape.Left}, {shape.Top})");
                        audioInfo.Add($"  Size: {shape.Width} x {shape.Height}");
                        audioInfo.Add("");
                    }
                }

                return audioInfo.Count > 0 ? string.Join(Environment.NewLine, audioInfo) : "No audio found on this slide";
            }
            catch (Exception ex)
            {
                return $"Error getting audio info: {ex.Message}";
            }
        }

        /// <summary>
        /// Set advanced audio settings for a slide
        /// </summary>
        public void SetAudioSettings(int slideNumber, bool autoPlay = true, bool hideWhilePlaying = true, float volume = 1.0f)
        {
            try
            {
                PowerPoint.Slide slide = PowerPointApplication.ActivePresentation.Slides[slideNumber];
                int audioShapesModified = 0;

                foreach (PowerPoint.Shape shape in slide.Shapes)
                {
                    // Check for media shapes
                    if (shape.Type == Office.MsoShapeType.msoMedia || shape.Type.ToString().Contains("Media"))
                    {
                        if (shape.MediaFormat != null)
                        {
                            try
                            {
                                // Use reflection for version compatibility
                                var mediaFormat = shape.MediaFormat;

                                var playAutoProperty = mediaFormat.GetType().GetProperty("PlayAutomatically");
                                if (playAutoProperty != null && playAutoProperty.CanWrite)
                                {
                                    playAutoProperty.SetValue(mediaFormat, autoPlay ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                var hideProperty = mediaFormat.GetType().GetProperty("HideWhileNotPlaying");
                                if (hideProperty != null && hideProperty.CanWrite)
                                {
                                    hideProperty.SetValue(mediaFormat, hideWhilePlaying ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                var playOnEntryProperty = mediaFormat.GetType().GetProperty("PlayOnEntry");
                                if (playOnEntryProperty != null && playOnEntryProperty.CanWrite)
                                {
                                    playOnEntryProperty.SetValue(mediaFormat, autoPlay ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                // Volume control (available in newer PowerPoint versions)
                                var volumeProperty = mediaFormat.GetType().GetProperty("Volume");
                                if (volumeProperty != null && volumeProperty.CanWrite)
                                {
                                    volumeProperty.SetValue(mediaFormat, volume);
                                }
                            }
                            catch (Exception formatEx)
                            {
                                System.Diagnostics.Debug.WriteLine($"Audio format setting failed for shape {shape.Name}: {formatEx.Message}");
                                // Continue with other shapes
                            }
                        }

                        audioShapesModified++;
                    }
                }

                System.Diagnostics.Debug.WriteLine($"Modified {audioShapesModified} audio shapes on slide {slideNumber}");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to set audio settings: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Remove audio from specified slides or all slides
        /// </summary>
        public void RemoveAudioFromSlides(string slideNumbers)
        {
            try
            {
                int totalRemoved = 0;

                if (slideNumbers.ToLower() == "all")
                {
                    // Remove from all slides
                    foreach (PowerPoint.Slide slide in PowerPointApplication.ActivePresentation.Slides)
                    {
                        totalRemoved += RemoveAudioFromSlide(slide);
                    }
                }
                else
                {
                    // Remove from specific slides (comma-separated)
                    var slideNumArray = slideNumbers.Split(',').Select(s => int.Parse(s.Trim())).ToArray();
                    foreach (int slideNum in slideNumArray)
                    {
                        if (slideNum >= 1 && slideNum <= PowerPointApplication.ActivePresentation.Slides.Count)
                        {
                            PowerPoint.Slide slide = Application.ActivePresentation.Slides[slideNum];
                            totalRemoved += RemoveAudioFromSlide(slide);
                        }
                    }
                }

                MessageBox.Show($"Removed {totalRemoved} audio object(s) from presentation.",
                              "SlideScribe Media",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to remove audio: {ex.Message}", ex);
            }
        }

        private int RemoveAudioFromSlide(PowerPoint.Slide slide)
        {
            int removedCount = 0;

            // Collect audio shapes to remove (to avoid modifying collection while iterating)
            var audioShapes = new List<PowerPoint.Shape>();

            foreach (PowerPoint.Shape shape in slide.Shapes)
            {
                // Check for media shapes using both enum and string check for compatibility
                if (shape.Type == Office.MsoShapeType.msoMedia ||
                    shape.Type.ToString().Contains("Media") ||
                    shape.Name.StartsWith("SlideScribeAudio_"))
                {
                    audioShapes.Add(shape);
                }
            }

            // Remove audio shapes
            foreach (PowerPoint.Shape audioShape in audioShapes)
            {
                try
                {
                    audioShape.Delete();
                    removedCount++;
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Failed to delete shape {audioShape.Name}: {ex.Message}");
                }
            }

            return removedCount;
        }

        #endregion

        #region Custom Ribbon (if needed)

        private void AddCustomRibbon()
        {
            // Custom ribbon would be defined in XML file
            // This is a placeholder for future ribbon customization
        }

        #endregion

        #region VSTO generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InternalStartup()
        {
            this.Startup += new System.EventHandler(ThisAddIn_Startup);
            this.Shutdown += new System.EventHandler(ThisAddIn_Shutdown);
        }

        #endregion
    }
}
