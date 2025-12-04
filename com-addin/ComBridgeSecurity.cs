using System;
using System.Security.Cryptography;
using System.Text;

namespace com_addin
{
    public static class ComBridgeSecurity
    {
        public const int MaxMessageBytes = 64 * 1024; // 64KB per message
        public const int MaxDownloadBytes = 25 * 1024 * 1024; // 25MB max download size
        private static string _activeToken;
        private static bool _tokenLocked;

        public static string InitializeToken()
        {
            if (string.IsNullOrWhiteSpace(_activeToken))
            {
                _activeToken = Guid.NewGuid().ToString("N");
                _tokenLocked = false;
            }
            return _activeToken;
        }

        public static string GetToken()
        {
            return _activeToken ?? InitializeToken();
        }

        public static string RequestOneTimeToken()
        {
            // Reuse the existing token for the app lifetime to keep the encryption key stable.
            if (string.IsNullOrWhiteSpace(_activeToken))
            {
                _activeToken = Guid.NewGuid().ToString("N");
            }
            _tokenLocked = true;
            return _activeToken;
        }

        public static bool IsTokenLocked => _tokenLocked;

        public static bool IsAuthorized(ComBridgeMessage message, out string error)
        {
            // Allow handshake and health without a token
            if (message != null &&
                (string.Equals(message.Method, "requestauth", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(message.Method, "testconnection", StringComparison.OrdinalIgnoreCase)))
            {
                error = null;
                return true;
            }

            var configuredToken = GetToken();

            if (message?.Parameters != null &&
                message.Parameters.TryGetValue("authToken", out var tokenObj) &&
                string.Equals(tokenObj?.ToString(), configuredToken, StringComparison.Ordinal))
            {
                error = null;
                return true;
            }

            error = "Unauthorized";
            return false;
        }

        public static bool IsHttpsUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return false;
            }

            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                return false;
            }

            // Permit HTTPS anywhere; allow HTTP only for loopback/localhost to support local dev.
            if (uri.Scheme == Uri.UriSchemeHttps)
            {
                return true;
            }

            return uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback;
        }

        public static byte[] GetEncryptionKeyBytes()
        {
            var token = GetToken();
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new InvalidOperationException("Missing required auth token for COM Bridge encryption.");
            }

            using (var sha = SHA256.Create())
            {
                return sha.ComputeHash(Encoding.UTF8.GetBytes(token));
            }
        }
    }
}
