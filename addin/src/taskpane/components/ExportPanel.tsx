import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  Play,
  FileAudio,
  FileVideo,
  FileText,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Music,
  Zap,
} from "lucide-react";
import { NarrationJob } from "../../utils/apiClient";
import { embedPreparedSlideAudio, prepareSlideAudioSources } from "@utils/embedNarration";
import { comBridge } from "@utils/comBridge";
import { Button } from "@ui/button";

interface ExportPanelProps {
  jobId: string | null;
  job: NarrationJob | null;
  onEmbedComplete?: () => void;
}

interface ExportStatus {
  format: string;
  url: string;
  size: number;
  status: "ready" | "processing" | "error";
  message?: string;
}

interface SlideScript {
  slideNumber: number;
  audioUrl?: string;
  subtitles?: Array<{
    start_time: number;
    end_time: number;
    text: string;
    index: number;
  }>;
  transcript?: string;
  duration?: number;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ jobId, job, onEmbedComplete }) => {
  const [exports, setExports] = useState<ExportStatus[]>([]);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<"idle" | "embedding" | "success" | "error">(
    "idle"
  );
  const [embedMessage, setEmbedMessage] = useState<string>("");
  const [slideScripts, setSlideScripts] = useState<Record<number, SlideScript>>({});
  const [comBridgeAvailable, setComBridgeAvailable] = useState(false);
  const [useComBridge, setUseComBridge] = useState(true); // User preference

  // Detect COM Bridge availability
  const detectComBridge = useCallback(async () => {
    try {
      // Only detect if not already available
      const currentStatus = comBridge.getAvailability();
      if (currentStatus.isAvailable) {
        setComBridgeAvailable(true);
        console.log(`COM Bridge already available`);
        return;
      }

      const available = await comBridge.detectAndInitialize();
      setComBridgeAvailable(available);
      console.log(`COM Bridge availability: ${available}`);
    } catch (error) {
      console.warn("COM Bridge detection failed:", error);
      setComBridgeAvailable(false);
    }
  }, []);

  // Load Office.js data and exports when job is complete
  const loadOfficeJsData = useCallback(async (jobId: string) => {
    if (!jobId) return;

    try {
      const response = await fetch(`http://localhost:8000/media/${jobId}/office_js_data.json`);
      if (!response.ok) return;

      const officeJsData = await response.json();
      const updatedSlideScripts: Record<number, SlideScript> = {};

      for (const slide of officeJsData.slides) {
        updatedSlideScripts[slide.slide_number] = {
          audioUrl: `http://localhost:8000${slide.audio.file_path}`,
          subtitles: slide.subtitles,
          transcript: slide.transcript,
          duration: slide.audio.duration
        };
      }

      setSlideScripts(updatedSlideScripts);
    } catch (error) {
      console.error("Failed to load Office.js data:", error);
    }
  }, []);

  useEffect(() => {
    if (jobId && (job?.status === "completed" || job?.status === "JobStatus.COMPLETED")) {
      loadExports();
      loadOfficeJsData(jobId);
      detectComBridge(); // Detect COM Bridge when job completes
    }
  }, [jobId, job?.status, loadOfficeJsData, detectComBridge]);

  const loadExports = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/audio/exports/${jobId}`, {
        headers: {
          Authorization: "Bearer test_token",
        },
      });
      if (response.ok) {
        const exportData = await response.json();
        setExports(exportData.exports || []);
      }
    } catch (error) {
      console.error("Failed to load exports:", error);
    }
  };

  const downloadFile = async (format: string, url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;

      // Set filename based on format
      const extension = format.toLowerCase();
      a.download = `narration_${jobId}.${extension}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error(`Failed to download ${format}:`, error);
    }
  };

  const embedAudioInPowerPoint = async () => {
    if (!jobId || Object.keys(slideScripts).length === 0) {
      setEmbedStatus("error");
      setEmbedMessage("No audio data available for embedding");
      return;
    }

    setIsEmbedding(true);
    setEmbedStatus("embedding");
    setEmbedMessage("Embedding audio into PowerPoint...");

    try {
      const totalSlides = Object.keys(slideScripts).length;

      // Real-time check of COM Bridge availability
      const currentComBridgeStatus = comBridge.getAvailability();
      const actuallyAvailable = currentComBridgeStatus.isAvailable;

      console.log(`🔍 COM Bridge status check: enabled=${useComBridge}, available=${comBridgeAvailable}, actuallyAvailable=${actuallyAvailable}`);

      // Try COM Bridge first if available and enabled
      if (useComBridge && actuallyAvailable) {
        setEmbedMessage("Using COM Bridge for enhanced embedding...");
        console.log("🎯 Attempting COM Bridge audio embedding");

        // Embed via COM Bridge for each slide
        let successCount = 0;
        let errorCount = 0;

        for (const slideNumber of Object.keys(slideScripts).map(Number)) {
          const slide = slideScripts[slideNumber];
          if (slide.audioUrl) {
            try {
              console.log(`🎵 Embedding audio for slide ${slideNumber}: ${slide.audioUrl}`);
              await comBridge.embedAudioFromFile(slide.audioUrl, slideNumber);
              successCount++;
              setEmbedMessage(`COM Bridge: Embedded audio for slide ${slideNumber} (${successCount}/${totalSlides})`);
              console.log(`✅ Successfully embedded audio for slide ${slideNumber}`);
            } catch (error) {
              console.error(`❌ COM Bridge failed for slide ${slideNumber}:`, error);
              errorCount++;
            }
          } else {
            console.warn(`⚠️ No audio URL found for slide ${slideNumber}`);
          }
        }

        console.log(`📊 COM Bridge embedding complete: ${successCount} success, ${errorCount} errors`);

        if (successCount > 0) {
          setEmbedStatus("success");
          setEmbedMessage(`✅ COM Bridge embedded audio into ${successCount} slide${successCount === 1 ? "" : "s"}!`);
          if (onEmbedComplete) onEmbedComplete();
        } else if (errorCount === totalSlides) {
          throw new Error("COM Bridge failed to embed any audio. Check that the COM Add-in is running in PowerPoint.");
        }
      } else {
        // Fall back to Office.js if COM Bridge not available
        const reason = !useComBridge ? "COM Bridge disabled by user" :
                      !comBridgeAvailable ? "COM Bridge not available" : "Unknown reason";
        setEmbedMessage(`Using Office.js for embedding (${reason})`);
        console.log(`⚠️ Falling back to Office.js: ${reason}`);

        // Check if PowerPoint API is available (this should work inside PowerPoint)
        if (typeof PowerPoint === "undefined") {
          throw new Error("PowerPoint API is not available. This add-in must be running inside PowerPoint.");
        }

        if (typeof PowerPoint.run !== "function") {
          throw new Error("PowerPoint.run function is not available. Office.js context may not be properly initialized.");
        }

        // Prepare slide audio sources using the utility function
        const slideSourcesArray = Object.values(slideScripts).map((slide) => ({
          slideId: `slide-${slide.slideNumber}`,
          slideNumber: slide.slideNumber,
          audioUrl: slide.audioUrl ?? undefined,
        }));

        const { prepared, failedSlides } = await prepareSlideAudioSources(
          slideSourcesArray,
          async (audioUrl: string) => {
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        );

        if (prepared.length === 0) {
          throw new Error("No valid audio sources found for embedding");
        }

        setEmbedMessage(`Embedding audio into ${prepared.length} slide${prepared.length === 1 ? "" : "s"}...`);

        // Embed the prepared audio using the existing Office.js integration
        await embedPreparedSlideAudio(Office as any, prepared);

        setEmbedStatus("success");
        setEmbedMessage(`✅ Office.js embedded audio into ${prepared.length} slide${prepared.length === 1 ? "" : "s"}.`);
      }

      if (onEmbedComplete) {
        onEmbedComplete();
      }
    } catch (error) {
      console.error("Failed to embed audio:", error);
      setEmbedStatus("error");
      setEmbedMessage(
        `Failed to embed audio: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsEmbedding(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get pure base64
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getFormatIcon = (format: string) => {
    switch (format.toLowerCase()) {
      case "mp3":
      case "wav":
        return <FileAudio className="w-4 h-4" />;
      case "mp4":
        return <FileVideo className="w-4 h-4" />;
      case "vtt":
      case "srt":
        return <FileText className="w-4 h-4" />;
      default:
        return <Download className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!job) {
    return (
      <div className="p-6 text-center text-gray-500">
        <FileAudio className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No job selected</p>
      </div>
    );
  }

  // Handle both string and enum forms of completed status
  if (job.status !== "completed" && job.status !== "JobStatus.COMPLETED") {
    return (
      <div className="p-6 text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-500" />
        <p className="text-gray-600">Waiting for job completion...</p>
        <p className="text-sm text-gray-500 mt-2">Status: {job.status}</p>
      </div>
    );
  }

  return (
    <div className="narration-container">
      <div className="narration-view narration-view--settings">
        <div className="mb-6">
          <h3 className="narration-title">Export Options</h3>
          <p className="narration-description">
            Download your narration in various formats or embed directly into PowerPoint.
          </p>
        </div>

      {/* Available Exports */}
      <div className="mb-6">
        <h4 className="font-medium mb-3">Available Downloads</h4>
        {exports.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            <p>No exports available yet</p>
            <button
              onClick={loadExports}
              className="mt-2 text-blue-500 hover:text-blue-600 text-sm"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {exports.map((exportItem, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {getFormatIcon(exportItem.format)}
                  <div>
                    <span className="font-medium">{exportItem.format.toUpperCase()}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({formatFileSize(exportItem.size)})
                    </span>
                  </div>
                  {getStatusIcon(exportItem.status)}
                </div>
                <button
                  onClick={() => downloadFile(exportItem.format, exportItem.url)}
                  disabled={exportItem.status !== "ready"}
                  className="flex items-center space-x-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COM Bridge Status */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-3">COM Bridge Status</h4>
        <div className={`p-4 rounded-lg mb-4 ${
          comBridgeAvailable
            ? 'bg-green-50 border border-green-200'
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {comBridgeAvailable ? (
                <Zap className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {comBridgeAvailable ? 'COM Bridge Available' : 'COM Bridge Unavailable'}
                </p>
                <p className="text-xs text-gray-600">
                  {comBridgeAvailable
                    ? 'Enhanced media manipulation capabilities enabled'
                    : 'Standard mode (COM Bridge requires PowerPoint desktop)'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={detectComBridge}
              disabled={false}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="useComBridge"
              checked={useComBridge && comBridgeAvailable}
              onChange={(e) => setUseComBridge(e.target.checked)}
              disabled={!comBridgeAvailable}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor="useComBridge" className="text-sm font-medium text-gray-700">
              Use COM Bridge for audio embedding (recommended)
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={async () => {
                try {
                  const isConnected = await comBridge.testConnection();
                  if (isConnected) {
                    alert('✅ COM Bridge connection test successful!\n\nThe COM Add-in is running and ready for advanced audio embedding.');
                  } else {
                    alert('❌ COM Bridge connection failed.\n\nPlease ensure:\n1. COM Add-in is installed in PowerPoint\n2. PowerPoint is running with the COM Add-in loaded\n3. This Office.js add-in is running inside PowerPoint');
                  }
                } catch (error) {
                  alert(`❌ COM Bridge test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              disabled={!comBridgeAvailable}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Test COM Bridge
            </button>

            <button
              onClick={detectComBridge}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Refresh Connection
            </button>
          </div>

          {!comBridgeAvailable && (
            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
              <p className="font-semibold mb-1">💡 How to enable COM Bridge:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Build and register the COM Add-in (see com-addin folder)</li>
                <li>Install it in PowerPoint's COM Add-ins</li>
                <li>Run this Office.js add-in inside PowerPoint (not browser)</li>
                <li>COM Bridge will auto-connect when both are running</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* PowerPoint Embed */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-3">PowerPoint Integration</h4>
        <div className={`p-4 rounded-lg mb-4 ${
          useComBridge && comBridgeAvailable
            ? 'bg-green-50 border border-green-200'
            : 'bg-blue-50'
        }`}>
          <div className="flex items-start space-x-3">
            {useComBridge && comBridgeAvailable ? (
              <Zap className="w-5 h-5 text-green-600 mt-0.5" />
            ) : (
              <Play className="w-5 h-5 text-blue-500 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-medium ${
                useComBridge && comBridgeAvailable ? 'text-green-900' : 'text-blue-900'
              }`}>
                Embed Audio
                {useComBridge && comBridgeAvailable && (
                  <span className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded">
                    COM Bridge Active
                  </span>
                )}
              </p>
              <p className={`text-sm ${
                useComBridge && comBridgeAvailable ? 'text-green-700' : 'text-blue-700'
              }`}>
                {useComBridge && comBridgeAvailable
                  ? "Enhanced embedding via COM Bridge: Direct media manipulation, advanced audio controls, and reliable performance."
                  : "Add narration audio directly to your PowerPoint presentation. The audio will play automatically when the slide is shown."
                }
              </p>
            </div>
          </div>
        </div>

        <div className="narration-actions">
          <Button
            onClick={embedAudioInPowerPoint}
            disabled={isEmbedding || Object.keys(slideScripts).length === 0}
            className="narration-action-btn"
          >
            {isEmbedding ? (
              <>
                <Loader2 className="narration-btn-icon narration-btn-icon--spin" />
                Embedding…
              </>
            ) : (
              <>
                {useComBridge && comBridgeAvailable ? (
                  <Zap className="narration-btn-icon" />
                ) : (
                  <Music className="narration-btn-icon" />
                )}
                {useComBridge && comBridgeAvailable
                  ? "Embed Audio (COM Bridge Active)"
                  : useComBridge && !comBridgeAvailable
                    ? "Embed Audio (COM Bridge Connecting...)"
                    : "Embed Audio (Standard)"
                }
              </>
            )}
          </Button>
        </div>

        {/* Embed Status */}
        {embedStatus !== "idle" && (
          <div
            className={`narration-job-info ${
              embedStatus === "success"
                ? "narration-job-info--success"
                : embedStatus === "error"
                  ? "narration-job-info--error"
                  : ""
            }`}
          >
            <div className="flex items-center gap-2">
              {embedStatus === "success" && <CheckCircle className="narration-btn-icon" />}
              {embedStatus === "error" && <AlertCircle className="narration-btn-icon" />}
              {embedStatus === "embedding" && <Loader2 className="narration-btn-icon narration-btn-icon--spin" />}
              <span className="text-sm">{embedMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="narration-job-info">
        <h5 className="narration-label">Usage Instructions</h5>
        <ul className="narration-description">
          <li>• Download MP3 for audio-only playback</li>
          <li>• Download MP4 for video with audio</li>
          <li>• Download VTT/SRT for subtitle files</li>
          <li>• Use "Embed Audio" to add narration directly to PowerPoint</li>
          <li>• Embedded audio will play automatically when presenting</li>
        </ul>
      </div>
      </div>
    </div>
  );
};
