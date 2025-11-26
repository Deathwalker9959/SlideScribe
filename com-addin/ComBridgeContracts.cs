using System;
using System.Collections.Generic;

namespace com_addin
{
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
}
