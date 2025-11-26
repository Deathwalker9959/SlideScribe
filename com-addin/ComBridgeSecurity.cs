using System;

namespace com_addin
{
    public static class ComBridgeSecurity
    {
        public const int MaxMessageBytes = 64 * 1024; // 64KB per message
        public const int MaxDownloadBytes = 25 * 1024 * 1024; // 25MB max download size
        public const string AuthEnvVar = "SLIDESCRIBE_BRIDGE_TOKEN";
        private static string _activeToken;
        private static bool _tokenLocked;

        public static string InitializeToken()
        {
            var configuredToken = Environment.GetEnvironmentVariable(AuthEnvVar);
            _activeToken = string.IsNullOrWhiteSpace(configuredToken) ? Guid.NewGuid().ToString("N") : configuredToken;
            _tokenLocked = !string.IsNullOrWhiteSpace(configuredToken);
            return _activeToken;
        }

        public static string GetToken() => _activeToken ?? InitializeToken();

        public static string RequestOneTimeToken()
        {
            if (_tokenLocked)
            {
                throw new InvalidOperationException("Auth token already issued and locked.");
            }

            var token = GetToken();
            _tokenLocked = true;
            return token;
        }

        public static bool IsTokenLocked => _tokenLocked;

        public static bool IsAuthorized(ComBridgeMessage message, out string error)
        {
            if (message != null &&
                string.Equals(message.Method, "requestauth", StringComparison.OrdinalIgnoreCase) &&
                !_tokenLocked)
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
    }
}
