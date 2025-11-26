using System;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace com_addin
{
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
            try
            {
                var webSocketContext = await context.AcceptWebSocketAsync(subProtocol: null);
                var webSocket = webSocketContext.WebSocket;

                SlideScribeLogger.Info("WebSocket client connected");

                var buffer = new byte[BufferSize];

                while (webSocket.State == WebSocketState.Open && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    try
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), _cancellationTokenSource.Token);

                        if (result.Count > ComBridgeSecurity.MaxMessageBytes || !result.EndOfMessage)
                        {
                            SlideScribeLogger.Warn("WebSocket message too large or fragmented; closing connection");
                            await webSocket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Message too large", CancellationToken.None);
                            break;
                        }

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            var messageJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
                            var message = SimpleJson.Deserialize<ComBridgeMessage>(messageJson);

                            if (message != null)
                            {
                                if (!ComBridgeSecurity.IsAuthorized(message, out var authError))
                                {
                                    var unauthorized = Encoding.UTF8.GetBytes(SimpleJson.Serialize(new ComBridgeResponse
                                    {
                                        Id = message.Id,
                                        Success = false,
                                        Error = authError
                                    }));

                                    await webSocket.SendAsync(new ArraySegment<byte>(unauthorized), WebSocketMessageType.Text, true, _cancellationTokenSource.Token);
                                    continue;
                                }

                                var response = await _pipeServer.ProcessMessageAsync(message);

                                var responseJson = SimpleJson.Serialize(response);
                                var responseBuffer = Encoding.UTF8.GetBytes(responseJson);

                                await webSocket.SendAsync(
                                    new ArraySegment<byte>(responseBuffer),
                                    WebSocketMessageType.Text,
                                    true,
                                    _cancellationTokenSource.Token);
                            }
                            else
                            {
                                SlideScribeLogger.Warn("Failed to parse COM Bridge message");
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
                        SlideScribeLogger.Warn($"WebSocket communication error: {ex.Message}");
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
                try
                {
                    context.Response.Close();
                }
                catch
                {
                }
            }
        }
    }
}
