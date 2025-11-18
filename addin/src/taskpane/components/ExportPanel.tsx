import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { NarrationJob } from "../../state/types";

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

export const ExportPanel: React.FC<ExportPanelProps> = ({ jobId, job, onEmbedComplete }) => {
  const [exports, setExports] = useState<ExportStatus[]>([]);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<"idle" | "embedding" | "success" | "error">(
    "idle"
  );
  const [embedMessage, setEmbedMessage] = useState("");

  // Load available exports when job is complete
  useEffect(() => {
    if (jobId && job?.status === "completed") {
      loadExports();
    }
  }, [jobId, job?.status]);

  const loadExports = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/audio/exports/${jobId}`);
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
    if (!jobId || !Office) return;

    setIsEmbedding(true);
    setEmbedStatus("embedding");
    setEmbedMessage("Embedding audio into PowerPoint...");

    try {
      // Get the audio export URL
      const audioExport = exports.find((exp) => exp.format.toLowerCase() === "mp3");
      if (!audioExport) {
        throw new Error("No audio export available");
      }

      // Download audio data
      const audioResponse = await fetch(audioExport.url);
      const audioBlob = await audioResponse.blob();
      const audioBase64 = await blobToBase64(audioBlob);

      // Get current slide
      await PowerPoint.run(async (context) => {
        const slide = context.presentation.getSelectedSlides().getFirst();
        slide.load("id");
        await context.sync();

        // Create audio file name
        const audioFileName = `narration_${jobId}.mp3`;

        // Add audio to slide
        const audio = slide.shapes.addMediaObject(
          audioBase64,
          PowerPoint.MediaInsertType.audio,
          100,
          100,
          100,
          100
        ); // Position and size (will be adjusted)

        // Configure audio properties
        audio.media.playAutomatically = true;
        audio.media.hideWhilePlaying = true;

        // Position audio off-slide (invisible but functional)
        audio.left = context.presentation.slideWidth + 100;
        audio.top = context.presentation.slideHeight + 100;

        await context.sync();
      });

      setEmbedStatus("success");
      setEmbedMessage("Audio successfully embedded in PowerPoint!");

      // Notify parent component
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

  if (job.status !== "completed") {
    return (
      <div className="p-6 text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-500" />
        <p className="text-gray-600">Waiting for job completion...</p>
        <p className="text-sm text-gray-500 mt-2">Status: {job.status}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Export Options</h3>
        <p className="text-sm text-gray-600">
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

      {/* PowerPoint Embed */}
      <div className="border-t pt-6">
        <h4 className="font-medium mb-3">PowerPoint Integration</h4>
        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <div className="flex items-start space-x-3">
            <Play className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Embed Audio</p>
              <p className="text-sm text-blue-700">
                Add the narration audio directly to your PowerPoint presentation. The audio will
                play automatically when the slide is shown.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={embedAudioInPowerPoint}
          disabled={isEmbedding || exports.length === 0}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isEmbedding ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Embedding...</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>Embed Audio in PowerPoint</span>
            </>
          )}
        </button>

        {/* Embed Status */}
        {embedStatus !== "idle" && (
          <div
            className={`mt-3 p-3 rounded-lg ${
              embedStatus === "success"
                ? "bg-green-50 text-green-800"
                : embedStatus === "error"
                  ? "bg-red-50 text-red-800"
                  : "bg-blue-50 text-blue-800"
            }`}
          >
            <div className="flex items-center space-x-2">
              {embedStatus === "success" && <CheckCircle className="w-4 h-4" />}
              {embedStatus === "error" && <AlertCircle className="w-4 h-4" />}
              {embedStatus === "embedding" && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-sm">{embedMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h5 className="font-medium mb-2">Usage Instructions</h5>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Download MP3 for audio-only playback</li>
          <li>• Download MP4 for video with audio</li>
          <li>• Download VTT/SRT for subtitle files</li>
          <li>• Use "Embed Audio" to add narration directly to PowerPoint</li>
          <li>• Embedded audio will play automatically when presenting</li>
        </ul>
      </div>
    </div>
  );
};
