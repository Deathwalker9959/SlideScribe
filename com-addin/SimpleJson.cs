using System;
using System.Collections.Generic;
using System.Text;

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
                sb.Append("\"parameters\":");
                SerializeDictionary(msg.Parameters, sb);
                sb.Append(",");
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
            if (typeof(T) == typeof(ComBridgeMessage))
            {
                return ParseMessage(json) as T;
            }

            if (typeof(T) == typeof(ComBridgeResponse))
            {
                return ParseResponse(json) as T;
            }

            return new T();
        }

        private static ComBridgeMessage ParseMessage(string json)
        {
            var message = new ComBridgeMessage();

            var methodMatch = System.Text.RegularExpressions.Regex.Match(json, "\"method\":\"([^\"]+)\"");
            if (methodMatch.Success)
            {
                message.Method = methodMatch.Groups[1].Value;
            }

            var idMatch = System.Text.RegularExpressions.Regex.Match(json, "\"id\":\"([^\"]+)\"");
            if (idMatch.Success)
            {
                message.Id = idMatch.Groups[1].Value;
            }

            var parametersMatch = System.Text.RegularExpressions.Regex.Match(json, "\"parameters\":\\s*\\{([^}]+)\\}");
            if (parametersMatch.Success)
            {
                var parametersContent = parametersMatch.Groups[1].Value;
                var paramMatches = System.Text.RegularExpressions.Regex.Matches(parametersContent, "\"([^\"]+)\":\\s*([^,}]+)");
                foreach (System.Text.RegularExpressions.Match paramMatch in paramMatches)
                {
                    if (paramMatch.Success && paramMatch.Groups.Count >= 3)
                    {
                        var key = paramMatch.Groups[1].Value;
                        var value = paramMatch.Groups[2].Value.Trim();

                        if (value.StartsWith("\"") && value.EndsWith("\""))
                        {
                            value = value.Substring(1, value.Length - 2);
                        }

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
}
