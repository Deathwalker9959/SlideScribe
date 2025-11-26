using System;
using System.Diagnostics;

namespace com_addin
{
    internal static class SlideScribeLogger
    {
        private const string SourceName = "SlideScribe";

        public static void Info(string message) => Trace.WriteLine(message, $"{SourceName}:INFO");

        public static void Warn(string message) => Trace.WriteLine(message, $"{SourceName}:WARN");

        public static void Error(string message, Exception ex = null)
        {
            var details = ex == null ? message : $"{message} | {ex}";
            Trace.WriteLine(details, $"{SourceName}:ERROR");
        }
    }
}
