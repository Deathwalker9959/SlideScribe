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
                sb.Append($"\"{EscapeString(obj.ToString())}\"");
            }
            else if (type == typeof(int) || type == typeof(long))
            {
                sb.Append(obj.ToString());
            }
            else if (type == typeof(float) || type == typeof(double))
            {
                sb.Append(((IFormattable)obj).ToString("G", System.Globalization.CultureInfo.InvariantCulture));
            }
            else if (type == typeof(bool))
            {
                sb.Append(((bool)obj).ToString().ToLower());
            }
            else if (obj is Dictionary<string, object> dict)
            {
                SerializeDictionary(dict, sb);
            }
            else if (type == typeof(ComBridgeMessage))
            {
                var msg = (ComBridgeMessage)obj;
                sb.Append("{");
                sb.Append($"\"id\":\"{EscapeString(msg.Id)}\",");
                sb.Append($"\"method\":\"{EscapeString(msg.Method)}\",");
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
                sb.Append($"\"id\":\"{EscapeString(resp.Id)}\",");
                sb.Append($"\"success\":{resp.Success.ToString().ToLower()},");
                if (resp.Result != null)
                {
                    sb.Append($"\"result\":\"{EscapeString(resp.Result.ToString())}\",");
                }
                if (!string.IsNullOrEmpty(resp.Error))
                {
                    sb.Append($"\"error\":\"{EscapeString(resp.Error)}\",");
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
                sb.Append($"\"{EscapeString(kvp.Key)}\":");
                SerializeObject(kvp.Value, sb);
            }
            sb.Append("}");
        }

        private static string EscapeString(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;

            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
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

            // Generic object parsing for simple types with string properties
            return ParseGenericObject<T>(json);
        }

        /// <summary>
        /// Generic parser that extracts string properties from JSON using reflection.
        /// Used for simple envelope-style classes like Envelope with Id, EncryptedPayload, iv, etc.
        /// </summary>
        private static T ParseGenericObject<T>(string json) where T : class, new()
        {
            var result = new T();
            var type = typeof(T);

            foreach (var prop in type.GetProperties())
            {
                if (prop.PropertyType != typeof(string) || !prop.CanWrite)
                {
                    continue;
                }

                // Try both exact case and lowercase property name
                var propName = prop.Name;
                var propNameLower = char.ToLower(propName[0]) + propName.Substring(1);

                string value = null;

                // Try exact case first
                var match = System.Text.RegularExpressions.Regex.Match(
                    json,
                    $"\"{propName}\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"",
                    System.Text.RegularExpressions.RegexOptions.None
                );

                if (!match.Success)
                {
                    // Try lowercase version
                    match = System.Text.RegularExpressions.Regex.Match(
                        json,
                        $"\"{propNameLower}\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"",
                        System.Text.RegularExpressions.RegexOptions.None
                    );
                }

                if (match.Success)
                {
                    value = match.Groups[1].Value;
                    // Unescape basic escape sequences
                    value = value.Replace("\\\"", "\"").Replace("\\\\", "\\");
                    prop.SetValue(result, value);
                }
            }

            return result;
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

            // Extract parameters object by finding balanced braces
            var parametersContent = ExtractParametersObject(json);
            if (!string.IsNullOrEmpty(parametersContent))
            {
                // Match key-value pairs, handling quoted string values properly
                var paramMatches = System.Text.RegularExpressions.Regex.Matches(
                    parametersContent,
                    "\"([^\"]+)\":\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|[^,}\\]]+)"
                );
                foreach (System.Text.RegularExpressions.Match paramMatch in paramMatches)
                {
                    if (paramMatch.Success && paramMatch.Groups.Count >= 3)
                    {
                        var key = paramMatch.Groups[1].Value;
                        var value = paramMatch.Groups[2].Value.Trim();

                        if (value.StartsWith("\"") && value.EndsWith("\""))
                        {
                            value = value.Substring(1, value.Length - 2);
                            // Unescape escaped characters
                            value = value.Replace("\\\"", "\"").Replace("\\\\", "\\");
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

        /// <summary>
        /// Extract the parameters object content by finding balanced braces
        /// </summary>
        private static string ExtractParametersObject(string json)
        {
            var match = System.Text.RegularExpressions.Regex.Match(json, "\"parameters\":\\s*\\{");
            if (!match.Success)
            {
                return null;
            }

            int startIndex = match.Index + match.Length;
            int braceCount = 1;
            int endIndex = startIndex;

            while (endIndex < json.Length && braceCount > 0)
            {
                char c = json[endIndex];
                if (c == '{')
                {
                    braceCount++;
                }
                else if (c == '}')
                {
                    braceCount--;
                }
                else if (c == '"')
                {
                    // Skip quoted strings to avoid counting braces inside strings
                    endIndex++;
                    while (endIndex < json.Length)
                    {
                        if (json[endIndex] == '\\' && endIndex + 1 < json.Length)
                        {
                            endIndex += 2; // Skip escaped character
                            continue;
                        }
                        if (json[endIndex] == '"')
                        {
                            break;
                        }
                        endIndex++;
                    }
                }
                endIndex++;
            }

            if (braceCount == 0)
            {
                // Return content inside braces (excluding the closing brace)
                return json.Substring(startIndex, endIndex - startIndex - 1);
            }

            return null;
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
