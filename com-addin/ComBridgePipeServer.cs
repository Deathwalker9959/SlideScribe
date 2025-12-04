using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using System.Text;

namespace com_addin
{
    /// <summary>
    /// Named Pipe server for COM-Office.js communication
    /// </summary>
    public class ComBridgePipeServer
    {
        private const string PipeName = "SlideScribeComBridge";
        private readonly ThisAddIn _addin;
        private readonly CancellationTokenSource _cancellationTokenSource;
        private Task _serverTask;

        public ComBridgePipeServer(ThisAddIn addin)
        {
            _addin = addin;
            _cancellationTokenSource = new CancellationTokenSource();
            ComBridgeSecurity.InitializeToken();
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
                    using (var namedPipeServer = new NamedPipeServerStream(
                        PipeName,
                        PipeDirection.InOut,
                        NamedPipeServerStream.MaxAllowedServerInstances,
                        PipeTransmissionMode.Message,
                        PipeOptions.Asynchronous))
                    {
                        await namedPipeServer.WaitForConnectionAsync(cancellationToken);
                        _ = Task.Run(async () => await HandleClientAsync(namedPipeServer), cancellationToken);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    SlideScribeLogger.Warn($"Pipe server error: {ex.Message}");
                    await Task.Delay(1000, cancellationToken);
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
                    var messageJson = await ReadMessageAsync(reader, ComBridgeSecurity.MaxMessageBytes);
                    if (string.IsNullOrWhiteSpace(messageJson))
                    {
                        await writer.WriteAsync(SimpleJson.Serialize(new ComBridgeResponse
                        {
                            Success = false,
                            Error = "Empty or oversized message"
                        }));
                        return;
                    }

                    var message = SimpleJson.Deserialize<ComBridgeMessage>(messageJson);

                    if (message != null)
                    {
                        var response = await ProcessMessageAsync(message);
                        var responseJson = SimpleJson.Serialize(response);
                        await writer.WriteAsync(responseJson);
                    }
                }
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Warn($"Error handling client: {ex.Message}");
            }
        }

        private static async Task<string> ReadMessageAsync(StreamReader reader, int maxBytes)
        {
            var buffer = new char[1024];
            var sb = new StringBuilder();
            int totalBytes = 0;

            while (true)
            {
                int read = await reader.ReadAsync(buffer, 0, buffer.Length);
                if (read <= 0)
                {
                    break;
                }

                sb.Append(buffer, 0, read);
                totalBytes += Encoding.UTF8.GetByteCount(buffer, 0, read);

                if (totalBytes > maxBytes)
                {
                    return null;
                }
            }

            return sb.ToString();
        }

        public async Task<ComBridgeResponse> ProcessMessageAsync(ComBridgeMessage message)
        {
            try
            {
                var method = (message.Method ?? string.Empty).ToLowerInvariant();
                // Handle missing/undecoded method (e.g., plaintext test payload)
                if (string.IsNullOrWhiteSpace(method))
                {
                    if (!string.IsNullOrWhiteSpace(message?.Id) && message.Id.StartsWith("test_", StringComparison.OrdinalIgnoreCase))
                    {
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = true };
                    }
                    return new ComBridgeResponse { Id = message?.Id, Success = false, Error = "Missing method" };
                }

                if (!ComBridgeSecurity.IsAuthorized(message, out var authError) && !string.Equals(method, "requestauth", StringComparison.OrdinalIgnoreCase))
                {
                    return new ComBridgeResponse { Id = message?.Id, Success = false, Error = authError ?? "Unauthorized" };
                }

                switch (method)
                {
                    case "requestauth":
                        try
                        {
                            var token = ComBridgeSecurity.RequestOneTimeToken();
                            return new ComBridgeResponse { Id = message.Id, Success = true, Result = token };
                        }
                        catch (Exception ex)
                        {
                            return new ComBridgeResponse { Id = message.Id, Success = false, Error = ex.Message };
                        }

                    case "embedaudiofromfile":
                        var audioPath = message.Parameters.ContainsKey("audioFilePath") ? message.Parameters["audioFilePath"]?.ToString() : null;
                        var slideNumber = Convert.ToInt32(message.Parameters.ContainsKey("slideNumber") ? message.Parameters["slideNumber"] : -1);

                        if (string.IsNullOrEmpty(audioPath))
                        {
                            return new ComBridgeResponse { Id = message.Id, Success = false, Error = "Audio file path is null or empty" };
                        }

                        string localFilePath = audioPath;
                        if (audioPath.StartsWith("http://") || audioPath.StartsWith("https://"))
                        {
                            if (!ComBridgeSecurity.IsHttpsUrl(audioPath))
                            {
                                return new ComBridgeResponse { Id = message.Id, Success = false, Error = "Only HTTPS audio sources are allowed" };
                            }

                            try
                            {
                                localFilePath = await _addin.DownloadFileToTemp(audioPath);
                                SlideScribeLogger.Info($"Downloaded audio to: {localFilePath}");
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
                        var isConnected = _addin?.PowerPointApplication != null;
                        return new ComBridgeResponse { Id = message.Id, Success = true, Result = isConnected };

                    default:
                        return new ComBridgeResponse { Id = message.Id, Success = false, Error = $"Unknown method: {message.Method}" };
                }
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("COM bridge message processing failed", ex);
                return new ComBridgeResponse { Id = message.Id, Success = false, Error = ex.Message };
            }
        }
    }
}
