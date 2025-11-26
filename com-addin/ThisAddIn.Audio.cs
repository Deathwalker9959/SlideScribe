using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;
using Office = Microsoft.Office.Core;

namespace com_addin
{
    public partial class ThisAddIn
    {
        /// <summary>
        /// Embed audio file into specified slide with advanced options.
        /// </summary>
        public void EmbedAudioFromFile(string audioFilePath, int slideNumber = -1)
        {
            try
            {
                if (!File.Exists(audioFilePath))
                {
                    throw new FileNotFoundException($"Audio file not found: {audioFilePath}");
                }

                PowerPoint.Slide targetSlide = slideNumber > 0
                    ? PowerPointApplication.ActivePresentation.Slides[slideNumber]
                    : PowerPointApplication.ActiveWindow.View.Slide;

                if (targetSlide == null)
                {
                    throw new InvalidOperationException("No active slide found");
                }

                float slideWidth = PowerPointApplication.ActivePresentation.PageSetup.SlideWidth;
                float slideHeight = PowerPointApplication.ActivePresentation.PageSetup.SlideHeight;

                float leftPos = 50;
                float topPos = 50;

                if (targetSlide.Shapes.Count >= 1)
                {
                    leftPos = targetSlide.Shapes[1].Left + 50;
                    topPos = targetSlide.Shapes[1].Top + 50;
                }

                PowerPoint.Shape audioShape = null;
                Exception lastException = null;
                string attemptedMethods = string.Empty;

                SlideScribeLogger.Info($"Attempting to embed audio file: {audioFilePath}");
                SlideScribeLogger.Info($"Slide number: {slideNumber}, Slide ID: {targetSlide.SlideID}");

                try
                {
                    attemptedMethods += "AddMediaObject2(filename, link, save, left, top); ";
                    audioShape = targetSlide.Shapes.AddMediaObject2(
                        audioFilePath,
                        Office.MsoTriState.msoFalse,
                        Office.MsoTriState.msoTrue,
                        leftPos,
                        topPos);
                }
                catch (Exception ex1)
                {
                    lastException = ex1;

                    try
                    {
                        attemptedMethods += "AddMediaObject2(filename, link, save, 0, 0); ";
                        audioShape = targetSlide.Shapes.AddMediaObject2(
                            audioFilePath,
                            Office.MsoTriState.msoFalse,
                            Office.MsoTriState.msoTrue,
                            0,
                            0);
                    }
                    catch (Exception ex2)
                    {
                        lastException = ex2;

                        try
                        {
                            attemptedMethods += "AddMediaObject(filename); ";
                            var shapes = targetSlide.Shapes;
                            var mediaObjectType = typeof(PowerPoint.Shapes);
                            var addMediaMethod = mediaObjectType.GetMethod("AddMediaObject", new[] { typeof(string) });
                            if (addMediaMethod != null)
                            {
                                audioShape = addMediaMethod.Invoke(shapes, new object[] { audioFilePath }) as PowerPoint.Shape;
                            }
                            else
                            {
                                throw new Exception("AddMediaObject method not found via reflection");
                            }
                        }
                        catch (Exception ex3)
                        {
                            lastException = ex3;
                        }
                    }
                }

                if (audioShape == null)
                {
                    var detailedError = $"Failed to add media object. Attempted: {attemptedMethods}. " +
                                       $"Last error: {lastException?.Message ?? "Unknown"}. " +
                                       $"File: {audioFilePath}, Exists: {File.Exists(audioFilePath)}";
                    throw new Exception(detailedError);
                }

                try
                {
                    audioShape.Left = slideWidth - 100;
                    audioShape.Top = slideHeight - 100;
                    audioShape.Width = 32;
                    audioShape.Height = 32;

                    if (audioShape.MediaFormat != null)
                    {
                        var mediaFormat = audioShape.MediaFormat;
                        var playAutoProperty = mediaFormat.GetType().GetProperty("PlayOnEntry");
                        if (playAutoProperty != null && playAutoProperty.CanWrite)
                        {
                            playAutoProperty.SetValue(mediaFormat, Office.MsoTriState.msoTrue);
                        }

                        var hideProperty = mediaFormat.GetType().GetProperty("HideDuringShow");
                        if (hideProperty != null && hideProperty.CanWrite)
                        {
                            hideProperty.SetValue(mediaFormat, Office.MsoTriState.msoFalse);
                        }

                        var volumeProperty = mediaFormat.GetType().GetProperty("Volume");
                        if (volumeProperty != null && volumeProperty.CanWrite)
                        {
                            volumeProperty.SetValue(mediaFormat, 1.0f);
                        }
                    }

                    audioShape.Name = $"SlideScribeAudio_{Guid.NewGuid():N}";
                }
                catch (Exception configEx)
                {
                    SlideScribeLogger.Warn($"Audio configuration failed: {configEx.Message}");
                }

                SlideScribeLogger.Info($"Successfully embedded audio: {audioFilePath} into slide {slideNumber}");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to embed audio: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Get detailed audio information from slide.
        /// </summary>
        public string GetSlideAudioInfo(int slideNumber)
        {
            try
            {
                PowerPoint.Slide slide = PowerPointApplication.ActivePresentation.Slides[slideNumber];
                var audioInfo = new List<string>();

                foreach (PowerPoint.Shape shape in slide.Shapes)
                {
                    if (shape.Type == Office.MsoShapeType.msoMedia || shape.Type.ToString().Contains("Media"))
                    {
                        audioInfo.Add($"Audio Shape: {shape.Name}");
                        audioInfo.Add($"  Type: {shape.Type}");

                        if (shape.MediaFormat != null)
                        {
                            try
                            {
                                var mediaFormat = shape.MediaFormat;
                                var playAutoProperty = mediaFormat.GetType().GetProperty("PlayAutomatically");
                                if (playAutoProperty != null)
                                {
                                    audioInfo.Add($"  Auto-play: {playAutoProperty.GetValue(mediaFormat)}");
                                }

                                var hideProperty = mediaFormat.GetType().GetProperty("HideWhileNotPlaying");
                                if (hideProperty != null)
                                {
                                    audioInfo.Add($"  Hide while playing: {hideProperty.GetValue(mediaFormat)}");
                                }
                            }
                            catch (Exception formatEx)
                            {
                                audioInfo.Add($"  MediaFormat access: {formatEx.Message}");
                            }
                        }

                        audioInfo.Add($"  Position: ({shape.Left}, {shape.Top})");
                        audioInfo.Add($"  Size: {shape.Width} x {shape.Height}");
                        audioInfo.Add(string.Empty);
                    }
                }

                return audioInfo.Count > 0 ? string.Join(Environment.NewLine, audioInfo) : "No audio found on this slide";
            }
            catch (Exception ex)
            {
                return $"Error getting audio info: {ex.Message}";
            }
        }

        /// <summary>
        /// Set advanced audio settings for a slide.
        /// </summary>
        public void SetAudioSettings(int slideNumber, bool autoPlay = true, bool hideWhilePlaying = true, float volume = 1.0f)
        {
            try
            {
                PowerPoint.Slide slide = PowerPointApplication.ActivePresentation.Slides[slideNumber];
                int audioShapesModified = 0;

                foreach (PowerPoint.Shape shape in slide.Shapes)
                {
                    if (shape.Type == Office.MsoShapeType.msoMedia || shape.Type.ToString().Contains("Media"))
                    {
                        if (shape.MediaFormat != null)
                        {
                            try
                            {
                                var mediaFormat = shape.MediaFormat;

                                var playAutoProperty = mediaFormat.GetType().GetProperty("PlayAutomatically");
                                if (playAutoProperty != null && playAutoProperty.CanWrite)
                                {
                                    playAutoProperty.SetValue(mediaFormat, autoPlay ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                var hideProperty = mediaFormat.GetType().GetProperty("HideWhileNotPlaying");
                                if (hideProperty != null && hideProperty.CanWrite)
                                {
                                    hideProperty.SetValue(mediaFormat, hideWhilePlaying ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                var playOnEntryProperty = mediaFormat.GetType().GetProperty("PlayOnEntry");
                                if (playOnEntryProperty != null && playOnEntryProperty.CanWrite)
                                {
                                    playOnEntryProperty.SetValue(mediaFormat, autoPlay ? Office.MsoTriState.msoTrue : Office.MsoTriState.msoFalse);
                                }

                                var volumeProperty = mediaFormat.GetType().GetProperty("Volume");
                                if (volumeProperty != null && volumeProperty.CanWrite)
                                {
                                    volumeProperty.SetValue(mediaFormat, volume);
                                }
                            }
                            catch (Exception formatEx)
                            {
                                SlideScribeLogger.Warn($"Audio format setting failed for shape {shape.Name}: {formatEx.Message}");
                            }
                        }

                        audioShapesModified++;
                    }
                }

                SlideScribeLogger.Info($"Modified {audioShapesModified} audio shapes on slide {slideNumber}");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to set audio settings: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Remove audio from specified slides or all slides.
        /// </summary>
        public void RemoveAudioFromSlides(string slideNumbers)
        {
            try
            {
                int totalRemoved = 0;

                if (slideNumbers.ToLower() == "all")
                {
                    foreach (PowerPoint.Slide slide in PowerPointApplication.ActivePresentation.Slides)
                    {
                        totalRemoved += RemoveAudioFromSlide(slide);
                    }
                }
                else
                {
                    var slideNumArray = slideNumbers.Split(',').Select(s => int.Parse(s.Trim())).ToArray();
                    foreach (int slideNum in slideNumArray)
                    {
                        if (slideNum >= 1 && slideNum <= PowerPointApplication.ActivePresentation.Slides.Count)
                        {
                            PowerPoint.Slide slide = Application.ActivePresentation.Slides[slideNum];
                            totalRemoved += RemoveAudioFromSlide(slide);
                        }
                    }
                }

                SlideScribeLogger.Info($"Removed {totalRemoved} audio object(s) from presentation.");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to remove audio: {ex.Message}", ex);
            }
        }

        private int RemoveAudioFromSlide(PowerPoint.Slide slide)
        {
            int removedCount = 0;
            var audioShapes = new List<PowerPoint.Shape>();

            foreach (PowerPoint.Shape shape in slide.Shapes)
            {
                if (shape.Type == Office.MsoShapeType.msoMedia ||
                    shape.Type.ToString().Contains("Media") ||
                    shape.Name.StartsWith("SlideScribeAudio_"))
                {
                    audioShapes.Add(shape);
                }
            }

            foreach (PowerPoint.Shape audioShape in audioShapes)
            {
                try
                {
                    audioShape.Delete();
                    removedCount++;
                }
                catch (Exception ex)
                {
                    SlideScribeLogger.Warn($"Failed to delete shape {audioShape.Name}: {ex.Message}");
                }
            }

            return removedCount;
        }
    }
}
