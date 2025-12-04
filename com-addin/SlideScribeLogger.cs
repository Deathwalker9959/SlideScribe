using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace com_addin
{
    internal static class SlideScribeLogger
    {
        private const string SourceName = "SlideScribe";
        private static readonly object SyncRoot = new object();
        private static readonly string LogFilePath = ResolveLogPath();

        static SlideScribeLogger()
        {
            try
            {
                var dir = Path.GetDirectoryName(LogFilePath);
                if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
            }
            catch
            {
                // ignore failures; fallback writes will be skipped if file unavailable
            }
        }

        private static string ResolveLogPath()
        {
            try
            {
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                var folder = Path.Combine(appData, "SlideScribe");
                return Path.Combine(folder, "SlideScribe.log");
            }
            catch
            {
                // fallback to assembly directory
                var location = Assembly.GetExecutingAssembly().Location;
                var dir = Path.GetDirectoryName(location) ?? ".";
                return Path.Combine(dir, "SlideScribe.log");
            }
        }

        public static void Info(string message) => Write("INFO", message);

        public static void Warn(string message) => Write("WARN", message);

        public static void Error(string message, Exception ex = null)
        {
            var details = ex == null ? message : $"{message} | {ex}";
            Write("ERROR", details);
        }

        private static void Write(string level, string message)
        {
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}";
            try
            {
                lock (SyncRoot)
                {
                    File.AppendAllText(LogFilePath, line + Environment.NewLine);
                }
            }
            catch
            {
                // Swallow logging failures to avoid impacting runtime behavior
            }

            Trace.WriteLine(message, $"{SourceName}:{level}");
        }
    }
}
