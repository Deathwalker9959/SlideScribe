import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Alert, AlertDescription } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Progress } from "@ui/progress";
import {
  Download,
  Play,
  Settings,
  Volume2,
  FileAudio,
  FileVideo,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  X,
  FileText,
  Music,
  Share2,
  Eye,
} from "lucide-react";
import { apiClient, AudioExport, VoiceSettings } from "@utils/apiClient";

// Types
interface SlideScript {
  slideId: string;
  slideNumber: number;
  originalText: string;
  refinedScript: string;
  wordCount: number;
  duration: number;
  updatedAt: string;
  contextualHighlights: string[];
  contextualCallouts: string[];
  imageReferences: any[];
  contextualTransitions: Record<string, any>;
  contextConfidence: number | null;
  imageAttachments: any[];
  audioTimeline: any[];
  audioExports: AudioExport[];
  audioMixPath: string | null;
  audioPeakDb: number | null;
  audioLoudnessDb: number | null;
  audioBackgroundTrack: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
}

interface ExportPanelProps {
  slides: SlideScript[];
  narrationJobId?: string;
  isCompleted: boolean;
  voiceSettings?: VoiceSettings;
}

type ExportFormat = "mp4" | "pptx" | "audio" | "subtitles";
type ExportStatus = "idle" | "preparing" | "processing" | "completed" | "error";

interface ExportJob {
  id: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  downloadUrl?: string;
  fileSize?: number;
  error?: string;
  createdAt: string;
}

export function IntegratedExportPanel({
  slides,
  narrationJobId,
  isCompleted,
  voiceSettings,
}: ExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("mp4");
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeBackgroundMusic, setIncludeBackgroundMusic] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: ExportStatus;
    message: string;
  }>({ type: "idle", message: "" });
  const [availableExports, setAvailableExports] = useState<AudioExport[]>([]);

  // Load available exports when narration job is completed
  useEffect(() => {
    if (isCompleted && narrationJobId) {
      loadAvailableExports();
    }
  }, [isCompleted, narrationJobId]);

  const loadAvailableExports = async () => {
    if (!narrationJobId) return;

    try {
      const response = await apiClient.getAudioExports(narrationJobId);

      if (response.success && response.data) {
        setAvailableExports(response.data);
      }
    } catch (error) {
      console.error("Failed to load audio exports:", error);
    }
  };

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!narrationJobId) {
        setExportStatus({
          type: "error",
          message: "No narration job found. Please generate narration first.",
        });
        return;
      }

      setIsExporting(true);
      setExportStatus({ type: "preparing", message: "Preparing export..." });

      const exportJob: ExportJob = {
        id: `export_${Date.now()}`,
        format,
        status: "preparing",
        progress: 0,
        createdAt: new Date().toISOString(),
      };

      setExportJobs((prev) => [...prev, exportJob]);

      try {
        let response;

        switch (format) {
          case "audio":
            response = await apiClient.exportAudio(narrationJobId, {
              format: "mp3",
              includeSubtitles,
            });
            break;

          case "subtitles":
            response = await apiClient.exportSubtitles(narrationJobId, {
              format: "srt",
            });
            break;

          case "pptx":
            response = await apiClient.exportPowerPoint(narrationJobId, {
              includeAudio: true,
              includeSubtitles,
            });
            break;

          case "mp4":
            response = await apiClient.exportVideo(narrationJobId, {
              quality: "1080p",
              includeSubtitles,
              includeBackgroundMusic,
            });
            break;

          default:
            throw new Error(`Unsupported export format: ${format}`);
        }

        if (response.success) {
          setExportJobs((prev) =>
            prev.map((job) =>
              job.id === exportJob.id
                ? {
                    ...job,
                    status: "completed",
                    progress: 100,
                    downloadUrl: response.data?.downloadUrl,
                    fileSize: response.data?.fileSize,
                  }
                : job
            )
          );

          setExportStatus({
            type: "completed",
            message: `Export completed successfully! ${response.data?.fileSize ? `File size: ${(response.data.fileSize / 1024 / 1024).toFixed(2)} MB` : ""}`,
          });

          // Reload available exports
          await loadAvailableExports();
        } else {
          throw new Error(response.error || "Export failed");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Export failed";

        setExportJobs((prev) =>
          prev.map((job) =>
            job.id === exportJob.id ? { ...job, status: "error", error: errorMessage } : job
          )
        );

        setExportStatus({
          type: "error",
          message: errorMessage,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [narrationJobId, includeSubtitles, includeBackgroundMusic]
  );

  const handleDownload = useCallback(async (exportInfo: AudioExport | ExportJob) => {
    const downloadUrl = "downloadUrl" in exportInfo ? exportInfo.downloadUrl : exportInfo.path;

    if (!downloadUrl) {
      setExportStatus({
        type: "error",
        message: "Download URL not available",
      });
      return;
    }

    try {
      const response = await apiClient.downloadFile(downloadUrl);

      if (response.success && response.data) {
        // Create download link
        const url = window.URL.createObjectURL(response.data);
        const a = document.createElement("a");
        a.href = url;

        const format = "format" in exportInfo ? exportInfo.format : "mp4";
        a.download = `narration.${format}`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setExportStatus({
          type: "completed",
          message: "Download started successfully",
        });
      } else {
        throw new Error(response.error || "Download failed");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Download failed";
      setExportStatus({
        type: "error",
        message: errorMessage,
      });
    }
  }, []);

  const handleEmbedNarration = useCallback(async () => {
    if (!narrationJobId) {
      setExportStatus({
        type: "error",
        message: "No narration job found. Please generate narration first.",
      });
      return;
    }

    setIsExporting(true);
    setExportStatus({ type: "preparing", message: "Embedding narration..." });

    try {
      const response = await apiClient.embedNarration(narrationJobId, {
        targetSlides: slides.map((slide) => slide.slideId),
      });

      if (response.success) {
        setExportStatus({
          type: "completed",
          message: "Narration embedded successfully in PowerPoint!",
        });
      } else {
        throw new Error(response.error || "Embedding failed");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Embedding failed";
      setExportStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsExporting(false);
    }
  }, [narrationJobId, slides]);

  const hasNarration = slides.some((slide) => slide.audioUrl);
  const totalDuration = slides.reduce((sum, slide) => sum + (slide.audioDuration || 0), 0);
  const slidesWithAudio = slides.filter((slide) => slide.audioUrl).length;

  const getFormatIcon = (format: ExportFormat) => {
    switch (format) {
      case "mp4":
        return <FileVideo className="h-5 w-5" />;
      case "pptx":
        return <FileText className="h-5 w-5" />;
      case "audio":
        return <FileAudio className="h-5 w-5" />;
      case "subtitles":
        return <FileText className="h-5 w-5" />;
      default:
        return <Download className="h-5 w-5" />;
    }
  };

  const getFormatLabel = (format: ExportFormat) => {
    switch (format) {
      case "mp4":
        return "MP4 Video";
      case "pptx":
        return "PowerPoint with Audio";
      case "audio":
        return "Audio Only";
      case "subtitles":
        return "Subtitles";
      default:
        return format.toUpperCase();
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {exportStatus.type !== "idle" && (
        <Alert variant={exportStatus.type === "error" ? "destructive" : "default"}>
          {exportStatus.type === "preparing" && <Loader2 className="h-4 w-4 animate-spin" />}
          {exportStatus.type === "completed" && <CheckCircle className="h-4 w-4" />}
          {exportStatus.type === "error" && <AlertCircle className="h-4 w-4" />}
          <AlertDescription className="flex items-center justify-between">
            <span>{exportStatus.message}</span>
            {exportStatus.type !== "preparing" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportStatus({ type: "idle", message: "" })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Narration Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Narration Summary
          </CardTitle>
          <CardDescription>Overview of generated narration and export options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {slidesWithAudio}/{slides.length}
              </div>
              <div className="text-sm text-muted-foreground">Slides with Audio</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(0).padStart(2, "0")}
              </div>
              <div className="text-sm text-muted-foreground">Total Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{voiceSettings?.voice || "N/A"}</div>
              <div className="text-sm text-muted-foreground">Voice</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{voiceSettings?.language || "N/A"}</div>
              <div className="text-sm text-muted-foreground">Language</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Options
          </CardTitle>
          <CardDescription>Choose your preferred export format and settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Format Selection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["mp4", "pptx", "audio", "subtitles"] as ExportFormat[]).map((format) => (
              <div
                key={format}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedFormat === format
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50"
                }`}
                onClick={() => setSelectedFormat(format)}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  {getFormatIcon(format)}
                  <div className="font-medium">{getFormatLabel(format)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Export Settings */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeSubtitles"
                checked={includeSubtitles}
                onChange={(e) => setIncludeSubtitles(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="includeSubtitles" className="text-sm font-medium">
                Include subtitles/captions
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeBackgroundMusic"
                checked={includeBackgroundMusic}
                onChange={(e) => setIncludeBackgroundMusic(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="includeBackgroundMusic" className="text-sm font-medium">
                Include background music
              </label>
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleExport(selectedFormat)}
              disabled={!hasNarration || isExporting}
              className="flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export {getFormatLabel(selectedFormat)}
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleEmbedNarration}
              disabled={!hasNarration || isExporting}
              className="flex items-center gap-2"
            >
              <Volume2 className="h-4 w-4" />
              Embed in PowerPoint
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Jobs */}
      {exportJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Export Jobs
            </CardTitle>
            <CardDescription>Track your export progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {exportJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getFormatIcon(job.format)}
                    <div>
                      <div className="font-medium">{getFormatLabel(job.format)}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "default"
                          : job.status === "error"
                            ? "destructive"
                            : job.status === "processing"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {job.status}
                    </Badge>

                    {job.status === "processing" && (
                      <div className="w-24">
                        <Progress value={job.progress} className="h-2" />
                      </div>
                    )}

                    {job.status === "completed" && job.downloadUrl && (
                      <Button variant="outline" size="sm" onClick={() => handleDownload(job)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Downloads */}
      {availableExports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileAudio className="h-5 w-5" />
              Available Downloads
            </CardTitle>
            <CardDescription>Download previously generated exports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {availableExports.map((exportInfo, index) => (
                <div
                  key={`export-${exportInfo.format}-${index}`}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileAudio className="h-5 w-5" />
                    <div>
                      <div className="font-medium">{exportInfo.format.toUpperCase()}</div>
                      {exportInfo.fileSize && (
                        <div className="text-sm text-muted-foreground">
                          {(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {exportInfo.downloadUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(exportInfo)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Export Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <FileVideo className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <strong>MP4 Video:</strong> Creates a video file with synchronized narration and
                slide transitions
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <strong>PowerPoint:</strong> Generates an enhanced PowerPoint file with embedded
                audio and optional subtitles
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileAudio className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <strong>Audio Only:</strong> Exports the narration audio as a separate MP3 file
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <strong>Subtitles:</strong> Generates subtitle files in SRT format
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
