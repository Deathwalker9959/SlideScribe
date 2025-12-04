using System;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Security.Cryptography;

namespace com_addin
{
    /// <summary>
    /// WebSocket server for COM-Office.js communication with AES-CBC encryption.
    /// </summary>
    public class ComBridgeWebSocketServer
    {
        private readonly HttpListener _httpListener;
        private readonly ComBridgePipeServer _pipeServer;
        private CancellationTokenSource _cancellationTokenSource;
        private Task _serverTask;
        private const string WebSocketPath = "/slidescribe-com-bridge";
        private const int Port = 8765;
        private const int BufferSize = ComBridgeSecurity.MaxMessageBytes;

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

                SlideScribeLogger.Info($"WebSocket server started on http://localhost:{Port}{WebSocketPath}/");
                return Task.CompletedTask;
            }
            catch (HttpListenerException ex)
            {
                SlideScribeLogger.Error("WebSocket server failed to start", ex);
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

                SlideScribeLogger.Info("WebSocket server stopped");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("Error stopping WebSocket server", ex);
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
                    SlideScribeLogger.Warn($"WebSocket listener error: {ex.Message}");
                    await Task.Delay(1000, _cancellationTokenSource.Token);
                }
            }
        }

        private async Task HandleWebSocketAsync(HttpListenerContext context)
        {
            WebSocket webSocket = null;
            try
            {
                var webSocketContext = await context.AcceptWebSocketAsync(subProtocol: null);
                webSocket = webSocketContext.WebSocket;

                SlideScribeLogger.Info("WebSocket client connected");

                var buffer = new byte[BufferSize];

                while (webSocket.State == WebSocketState.Open && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    try
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), _cancellationTokenSource.Token);

                        if (result.Count > ComBridgeSecurity.MaxMessageBytes || !result.EndOfMessage)
                        {
                            SlideScribeLogger.Warn("Message too large or fragmented");
                            await webSocket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Message too large", CancellationToken.None);
                            break;
                        }

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            await ProcessTextMessageAsync(webSocket, buffer, result.Count);
                        }
                        else if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                            break;
                        }
                    }
                    catch (WebSocketException ex)
                    {
                        SlideScribeLogger.Warn($"WebSocket error: {ex.Message}");
                        break;
                    }
                }

                SlideScribeLogger.Info("WebSocket client disconnected");
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("WebSocket handler error", ex);
            }
            finally
            {
                try { context.Response.Close(); } catch { }
            }
        }

        private async Task ProcessTextMessageAsync(WebSocket webSocket, byte[] buffer, int count)
        {
            var messageJson = Encoding.UTF8.GetString(buffer, 0, count);
            var wasEncrypted = IsEncryptedEnvelope(messageJson);
            var decryptedJson = TryDecryptEnvelope(messageJson);
            var message = SimpleJson.Deserialize<ComBridgeMessage>(decryptedJson);

            if (message == null)
            {
                SlideScribeLogger.Warn("Failed to parse message");
                return;
            }

            // Handle missing method for test messages
            if (string.IsNullOrWhiteSpace(message.Method) && message.Id?.StartsWith("test_", StringComparison.OrdinalIgnoreCase) == true)
            {
                message.Method = "testconnection";
            }

            // Enforce auth except for handshake methods
            var isHandshake = string.Equals(message.Method, "testconnection", StringComparison.OrdinalIgnoreCase) ||
                              string.Equals(message.Method, "requestauth", StringComparison.OrdinalIgnoreCase);

            if (!isHandshake && !ComBridgeSecurity.IsAuthorized(message, out var authError))
            {
                SlideScribeLogger.Warn($"Auth failed for '{message.Method}': {authError}");
                var errorResponse = SimpleJson.Serialize(new ComBridgeResponse
                {
                    Id = message.Id,
                    Success = false,
                    Error = authError
                });
                await SendResponseAsync(webSocket, errorResponse);
                return;
            }

            var response = await _pipeServer.ProcessMessageAsync(message);
            var responseJson = SimpleJson.Serialize(response);
            var responsePayload = wasEncrypted ? EncryptEnvelope(response.Id, responseJson, message.Method) : responseJson;

            await SendResponseAsync(webSocket, responsePayload);
        }

        private async Task SendResponseAsync(WebSocket webSocket, string payload)
        {
            var responseBuffer = Encoding.UTF8.GetBytes(payload);
            await webSocket.SendAsync(
                new ArraySegment<byte>(responseBuffer),
                WebSocketMessageType.Text,
                true,
                _cancellationTokenSource.Token);
        }

        private string TryDecryptEnvelope(string messageJson)
        {
            try
            {
                var envelope = SimpleJson.Deserialize<Envelope>(messageJson);
                var encPayload = envelope?.EncryptedPayload ?? envelope?.encryptedPayload;
                var ivVal = envelope?.Iv ?? envelope?.iv;

                if (string.IsNullOrWhiteSpace(encPayload) || string.IsNullOrWhiteSpace(ivVal))
                {
                    return messageJson;
                }

                var key = ComBridgeSecurity.GetEncryptionKeyBytes();
                var cipherBytes = Convert.FromBase64String(encPayload);
                var ivBytes = Convert.FromBase64String(ivVal);

                using (var aes = Aes.Create())
                {
                    aes.Mode = CipherMode.CBC;
                    aes.Padding = PaddingMode.PKCS7;
                    aes.Key = key;
                    aes.IV = ivBytes;

                    using (var decryptor = aes.CreateDecryptor())
                    {
                        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
                        return Encoding.UTF8.GetString(plainBytes);
                    }
                }
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Warn($"Decryption failed: {ex.Message}");
                return messageJson;
            }
        }

        private string EncryptEnvelope(string id, string responseJson, string originalMethod)
        {
            // Skip encryption for handshake methods - client expects plaintext for these
            if (!string.IsNullOrWhiteSpace(originalMethod) &&
                (string.Equals(originalMethod, "testconnection", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(originalMethod, "requestauth", StringComparison.OrdinalIgnoreCase)))
            {
                return responseJson;
            }

            using (var aes = Aes.Create())
            {
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.Key = ComBridgeSecurity.GetEncryptionKeyBytes();
                aes.GenerateIV();

                using (var encryptor = aes.CreateEncryptor())
                {
                    var plainBytes = Encoding.UTF8.GetBytes(responseJson);
                    var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

                    // Use camelCase to match frontend expectations
                    var envelope = new System.Collections.Generic.Dictionary<string, object>
                    {
                        { "id", id },
                        { "encryptedPayload", Convert.ToBase64String(cipherBytes) },
                        { "iv", Convert.ToBase64String(aes.IV) }
                    };

                    return SimpleJson.Serialize(envelope);
                }
            }
        }

        private static bool IsEncryptedEnvelope(string messageJson)
        {
            try
            {
                var env = SimpleJson.Deserialize<Envelope>(messageJson);
                var encPayload = env?.EncryptedPayload ?? env?.encryptedPayload;
                return !string.IsNullOrWhiteSpace(encPayload);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Envelope for encrypted message transport. Supports both camelCase and PascalCase.
        /// </summary>
        private class Envelope
        {
            public string Id { get; set; }
            public string encryptedPayload { get; set; }
            public string EncryptedPayload { get; set; }
            public string iv { get; set; }
            public string Iv { get; set; }
        }
    }
}
