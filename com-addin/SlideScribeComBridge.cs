using System;
using System.Runtime.InteropServices;

namespace com_addin
{
    /// <summary>
    /// COM Bridge interface for Office.js integration
    /// </summary>
    [ComVisible(true)]
    [Guid("87654321-4321-8765-2109-876543210fed")]
    [InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface ISlideScribeComBridge
    {
        void EmbedAudioFromFile(string audioFilePath, int slideNumber);
        string GetSlideAudioInfo(int slideNumber);
        void SetAudioSettings(int slideNumber, bool autoPlay, bool hideWhilePlaying, float volume);
        void RemoveAudioFromSlides(string slideNumbers);
        bool TestConnection();
    }

    /// <summary>
    /// COM Bridge implementation for Office.js communication
    /// </summary>
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class SlideScribeComBridge : ISlideScribeComBridge
    {
        private readonly ThisAddIn _addin;

        public SlideScribeComBridge(ThisAddIn addin)
        {
            _addin = addin;
        }

        public void EmbedAudioFromFile(string audioFilePath, int slideNumber)
        {
            Execute(() => _addin.EmbedAudioFromFile(audioFilePath, slideNumber), "EmbedAudioFromFile");
        }

        public string GetSlideAudioInfo(int slideNumber)
        {
            try
            {
                return _addin.GetSlideAudioInfo(slideNumber);
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error("GetSlideAudioInfo failed", ex);
                return $"Error: {ex.Message}";
            }
        }

        public void SetAudioSettings(int slideNumber, bool autoPlay, bool hideWhilePlaying, float volume)
        {
            Execute(() => _addin.SetAudioSettings(slideNumber, autoPlay, hideWhilePlaying, volume), "SetAudioSettings");
        }

        public void RemoveAudioFromSlides(string slideNumbers)
        {
            Execute(() => _addin.RemoveAudioFromSlides(slideNumbers), "RemoveAudioFromSlides");
        }

        public bool TestConnection()
        {
            try
            {
                return _addin != null && _addin.Application != null;
            }
            catch
            {
                return false;
            }
        }

        private static void Execute(Action action, string operation)
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                SlideScribeLogger.Error($"{operation} failed", ex);
                throw;
            }
        }
    }
}
