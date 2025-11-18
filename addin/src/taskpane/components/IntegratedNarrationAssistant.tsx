import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Progress } from "@ui/progress";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription } from "@ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  Play,
  Pause,
  Square,
  Volume2,
  FileText,
  Settings,
  Download,
  Upload,
  Mic,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Eye,
  Edit3,
  Save,
  RefreshCw,
  Shield,
  ShieldCheck,
  LogOut,
  User,
} from "lucide-react";

import { VoiceSettingsPanel } from "./VoiceSettingsPanel";
import { ScriptEditor } from "./ScriptEditor";
import { IntegratedExportPanel } from "./IntegratedExportPanel";
import { AuthPanel, DevAuthPanel } from "./AuthPanel";
import { apiClient, VoiceSettings, NarrationJob, SlideData } from "@utils/apiClient";

// Types
interface NarrationState {
  status: "idle" | "analyzing" | "generating" | "recording" | "processing" | "completed" | "error";
  progress: number;
  currentSlide: number;
  totalSlides: number;
  jobId?: string;
  error?: string;
}

interface SlideNarration {
  slideId: string;
  title: string;
  content: string;
  generatedNarration?: string;
  audioUrl?: string;
  duration?: number;
  status: "pending" | "generating" | "completed" | "error";
}

// Props
interface IntegratedNarrationAssistantProps {
  presentationId?: string;
  onNarrationComplete?: (audioUrl: string) => void;
  onError?: (error: string) => void;
}

export function IntegratedNarrationAssistant({
  presentationId,
  onNarrationComplete,
  onError,
}: IntegratedNarrationAssistantProps) {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Narration state
  const [narrationState, setNarrationState] = useState<NarrationState>({
    status: "idle",
    progress: 0,
    currentSlide: 0,
    totalSlides: 0,
  });

  const [slides, setSlides] = useState<SlideNarration[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    provider: "azure",
    voice: "en-US-JennyNeural",
    speed: 1.0,
    pitch: 1.0,
    volume: 1.0,
    language: "en-US",
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Check if we're in development mode
  useEffect(() => {
    const checkDevelopmentMode = () => {
      if (typeof window !== "undefined") {
        const isDev =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname.includes("dev");
        setIsDevelopment(isDev);
      }
    };

    checkDevelopmentMode();
  }, []);

  // Initialize WebSocket connection for progress updates
  useEffect(() => {
    if (isAuthenticated && narrationState.jobId) {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      apiClient.connectWebSocket(
        clientId,
        (message) => {
          handleProgressUpdate(message);
        },
        (error) => {
          console.error("WebSocket error:", error);
          setLastError("WebSocket connection error");
        },
        (event) => {
          console.log("WebSocket closed:", event);
          if (!event.wasClean) {
            setLastError("WebSocket connection lost");
          }
        }
      );

      // Subscribe to job updates
      apiClient.subscribeToJob(narrationState.jobId);

      return () => {
        apiClient.unsubscribeFromJob(narrationState.jobId);
        apiClient.disconnectWebSocket();
      };
    }
  }, [isAuthenticated, narrationState.jobId]);

  const handleAuthChange = async (authenticated: boolean) => {
    setIsAuthenticated(authenticated);
    if (authenticated) {
      try {
        // Load user profile
        const user = await apiClient.getCurrentUser();
        setCurrentUser(user);

        // Load user's voice profiles and settings
        await loadUserSettings();

        // Load presentation slides
        await loadPresentationSlides();

        setStatusMessage("Successfully connected to SlideScribe");
      } catch (error) {
        console.error("Failed to load user data:", error);
        setLastError("Failed to load user settings");
      }
    } else {
      setCurrentUser(null);
      setSlides([]);
      setNarrationState({
        status: "idle",
        progress: 0,
        currentSlide: 0,
        totalSlides: 0,
      });
    }
  };

  const loadUserSettings = async () => {
    try {
      // Load voice profiles
      const profilesResponse = await apiClient.getVoiceProfiles();
      if (profilesResponse.success && profilesResponse.data?.length > 0) {
        const defaultProfile =
          profilesResponse.data.find((p) => p.is_default) || profilesResponse.data[0];
        if (defaultProfile) {
          setVoiceSettings(defaultProfile.settings);
          setStatusMessage("Loaded voice settings from profile");
        }
      }

      // Load available voices
      const voicesResponse = await apiClient.getAvailableVoices(voiceSettings.provider);
      if (voicesResponse.success) {
        console.log("Available voices loaded:", voicesResponse.data);
      }
    } catch (error) {
      console.error("Failed to load user settings:", error);
      // Don't set error here, as it's not critical
    }
  };

  const handleProgressUpdate = (update: any) => {
    if (update.job_id === narrationState.jobId) {
      setNarrationState((prev) => ({
        ...prev,
        status: update.status as any,
        progress: update.progress,
        currentSlide: update.current_slide,
        error: update.error,
      }));

      // Update slide statuses
      setSlides((prevSlides) =>
        prevSlides.map((slide, index) => ({
          ...slide,
          status:
            index < update.current_slide
              ? "completed"
              : index === update.current_slide
                ? "generating"
                : "pending",
        }))
      );

      // Handle completion
      if (update.status === "completed") {
        setIsGenerating(false);
        setStatusMessage("Narration completed successfully!");
        loadNarrationResults();
      } else if (update.status === "failed") {
        setIsGenerating(false);
        setLastError(update.error || "Narration failed");
      }
    }
  };

  const loadPresentationSlides = async () => {
    try {
      // This would integrate with Office.js to get actual slide data
      // For now, we'll create mock data that simulates PowerPoint slides
      const mockSlides: SlideNarration[] = [
        {
          slideId: "slide1",
          title: "Introduction",
          content:
            "Welcome to this presentation about our innovative solution that transforms how teams collaborate.",
          status: "pending",
        },
        {
          slideId: "slide2",
          title: "Problem Statement",
          content:
            "Today's teams face challenges with communication, project management, and maintaining productivity across different time zones.",
          status: "pending",
        },
        {
          slideId: "slide3",
          title: "Our Solution",
          content:
            "We introduce a comprehensive platform that integrates real-time collaboration, intelligent task management, and seamless workflow automation.",
          status: "pending",
        },
        {
          slideId: "slide4",
          title: "Key Features",
          content:
            "Our solution includes AI-powered insights, automated reporting, cross-platform compatibility, and enterprise-grade security.",
          status: "pending",
        },
        {
          slideId: "slide5",
          title: "Results & Impact",
          content:
            "Teams using our platform report 40% improvement in productivity, 60% faster project completion, and 90% user satisfaction.",
          status: "pending",
        },
        {
          slideId: "slide6",
          title: "Getting Started",
          content:
            "Contact our sales team for a personalized demo and see how our solution can transform your organization's collaboration.",
          status: "pending",
        },
      ];

      setSlides(mockSlides);
      setNarrationState((prev) => ({
        ...prev,
        totalSlides: mockSlides.length,
      }));
      setStatusMessage(`Loaded ${mockSlides.length} slides from presentation`);
    } catch (error) {
      console.error("Failed to load slides:", error);
      setLastError("Failed to load presentation slides");
      onError?.("Failed to load presentation slides");
    }
  };

  const startNarrationGeneration = async () => {
    if (!isAuthenticated) {
      setLastError("Please authenticate to start narration generation");
      onError?.("Please authenticate to start narration generation");
      return;
    }

    if (slides.length === 0) {
      setLastError("No slides available for narration");
      return;
    }

    setIsGenerating(true);
    setLastError(null);
    setStatusMessage("Starting narration generation...");

    setNarrationState({
      status: "analyzing",
      progress: 0,
      currentSlide: 0,
      totalSlides: slides.length,
    });

    try {
      // Convert slides to the format expected by the API
      const slideData: SlideData[] = slides.map((slide) => ({
        slide_id: slide.slideId,
        title: slide.title,
        content: slide.content,
        notes: "",
        images: [],
      }));

      const narrationRequest = {
        slides: slideData,
        settings: voiceSettings,
        metadata: {
          source: "office-addin",
          presentation_id: presentationId,
          requested_at: new Date().toISOString(),
        },
      };

      const response = await apiClient.createNarrationJob(narrationRequest);

      if (response.success && response.data?.job_id) {
        setNarrationState((prev) => ({
          ...prev,
          jobId: response.data!.job_id,
          status: "generating",
        }));
        setStatusMessage(`Narration job started: ${response.data!.job_id}`);
      } else {
        throw new Error(response.error || "Failed to create narration job");
      }
    } catch (error) {
      console.error("Failed to start narration generation:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to start narration generation";
      setNarrationState({
        status: "error",
        progress: 0,
        currentSlide: 0,
        totalSlides: slides.length,
        error: errorMessage,
      });
      setIsGenerating(false);
      setLastError(errorMessage);
      onError?.(errorMessage);
    }
  };

  const loadNarrationResults = async () => {
    if (!narrationState.jobId) return;

    try {
      const manifestResponse = await apiClient.getNarrationManifest(narrationState.jobId);

      if (manifestResponse.success && manifestResponse.data) {
        // Update slides with narration results
        setSlides((prevSlides) =>
          prevSlides.map((slide) => {
            const slideData = manifestResponse.data.slides[slide.slideId];
            return {
              ...slide,
              generatedNarration: slideData?.refined_content || slideData?.narration,
              audioUrl: slideData?.audio_url || slideData?.audio_result?.audio_url,
              duration: slideData?.audio_result?.duration,
              status: "completed" as const,
            };
          })
        );

        // Notify parent component
        const completeAudioUrl =
          manifestResponse.data.combined_audio_url ||
          manifestResponse.data.audio?.combined_output_path;
        if (completeAudioUrl) {
          onNarrationComplete?.(completeAudioUrl);
        }

        setStatusMessage("Narration results loaded successfully");
      }
    } catch (error) {
      console.error("Failed to load narration results:", error);
      setLastError("Failed to load narration results");
    }
  };

  const pauseGeneration = async () => {
    if (narrationState.jobId) {
      try {
        await apiClient.cancelNarrationJob(narrationState.jobId);
        setNarrationState((prev) => ({ ...prev, status: "idle" }));
        setIsGenerating(false);
        setStatusMessage("Narration generation cancelled");
      } catch (error) {
        console.error("Failed to pause generation:", error);
        setLastError("Failed to cancel narration generation");
      }
    }
  };

  const retryGeneration = () => {
    setNarrationState({
      status: "idle",
      progress: 0,
      currentSlide: 0,
      totalSlides: slides.length,
    });
    setIsGenerating(false);
    setLastError(null);
    setStatusMessage("Ready to retry narration generation");
  };

  const getStatusIcon = () => {
    switch (narrationState.status) {
      case "analyzing":
      case "generating":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Play className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (narrationState.status) {
      case "analyzing":
        return "Analyzing presentation content...";
      case "generating":
        return `Generating narration (Slide ${narrationState.currentSlide}/${narrationState.totalSlides})...`;
      case "processing":
        return "Processing audio files...";
      case "completed":
        return "Narration completed successfully";
      case "error":
        return narrationState.error || "An error occurred";
      default:
        return "Ready to generate narration";
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="narration-assistant p-6">
        <div className="mb-6">
          {isDevelopment ? (
            <DevAuthPanel onAuthChange={handleAuthChange} />
          ) : (
            <AuthPanel onAuthChange={handleAuthChange} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="narration-assistant space-y-6 p-6">
      {/* Authentication Status */}
      <div className="mb-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Connected to SlideScribe</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => apiClient.logout().then(() => handleAuthChange(false))}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
            <CardDescription>
              Connected as <span className="font-medium">{currentUser?.username || "User"}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>User ID: {currentUser?.id || "Unknown"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Messages */}
      {statusMessage && !lastError && (
        <Alert>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}

      {lastError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{lastError}</AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="script" className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            Script
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Voice
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon()}
                Narration Status
              </CardTitle>
              <CardDescription>{getStatusText()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {narrationState.status !== "idle" && narrationState.status !== "error" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(narrationState.progress * 100)}%</span>
                  </div>
                  <Progress value={narrationState.progress * 100} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Slide {narrationState.currentSlide} of {narrationState.totalSlides}
                    </span>
                    <span>{narrationState.jobId ? `Job: ${narrationState.jobId}` : ""}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!isGenerating && narrationState.status === "idle" && (
                  <Button
                    onClick={startNarrationGeneration}
                    disabled={slides.length === 0}
                    className="flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Generate Narration
                  </Button>
                )}

                {isGenerating && (
                  <Button
                    variant="outline"
                    onClick={pauseGeneration}
                    className="flex items-center gap-2"
                  >
                    <Square className="h-4 w-4" />
                    Cancel
                  </Button>
                )}

                {narrationState.status === "error" && (
                  <Button
                    variant="outline"
                    onClick={retryGeneration}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Slides Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Slides ({slides.length})</CardTitle>
              <CardDescription>
                Overview of presentation slides and their narration status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {slides.map((slide, index) => (
                  <div
                    key={slide.slideId}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setSelectedSlide(slide.slideId);
                      setActiveTab("script");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{slide.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {slide.content}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          slide.status === "completed"
                            ? "default"
                            : slide.status === "generating"
                              ? "secondary"
                              : slide.status === "error"
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {slide.status}
                      </Badge>
                      {slide.audioUrl && (
                        <Button variant="ghost" size="sm">
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="script">
          <ScriptEditor
            slides={slides.map((slide) => ({
              slideId: slide.slideId,
              slideNumber: slides.indexOf(slide) + 1,
              originalText: slide.content,
              refinedScript: slide.generatedNarration || slide.content,
              wordCount: slide.content.split(/\s+/).length,
              duration:
                slide.duration ||
                Math.max(5, Math.round((slide.content.split(/\s+/).length / 160) * 60)),
              updatedAt: new Date().toISOString(),
              contextualHighlights: [],
              contextualCallouts: [],
              imageReferences: [],
              contextualTransitions: {},
              contextConfidence: null,
              imageAttachments: [],
              audioTimeline: [],
              audioExports: [],
              audioMixPath: null,
              audioPeakDb: null,
              audioLoudnessDb: null,
              audioBackgroundTrack: null,
              audioUrl: slide.audioUrl || null,
              audioDuration: slide.duration || null,
            }))}
            selectedSlideId={selectedSlide}
            onSlideSelect={setSelectedSlide}
            onScriptUpdate={(slideId, newScript) => {
              setSlides((prev) =>
                prev.map((slide) =>
                  slide.slideId === slideId ? { ...slide, generatedNarration: newScript } : slide
                )
              );
            }}
          />
        </TabsContent>

        <TabsContent value="voice">
          <VoiceSettingsPanel settings={voiceSettings} onSettingsChange={setVoiceSettings} />
        </TabsContent>

        <TabsContent value="export">
          <IntegratedExportPanel
            slides={slides.map((slide) => ({
              slideId: slide.slideId,
              slideNumber: slides.indexOf(slide) + 1,
              originalText: slide.content,
              refinedScript: slide.generatedNarration || slide.content,
              wordCount: slide.content.split(/\s+/).length,
              duration:
                slide.duration ||
                Math.max(5, Math.round((slide.content.split(/\s+/).length / 160) * 60)),
              updatedAt: new Date().toISOString(),
              contextualHighlights: [],
              contextualCallouts: [],
              imageReferences: [],
              contextualTransitions: {},
              contextConfidence: null,
              imageAttachments: [],
              audioTimeline: [],
              audioExports: [],
              audioMixPath: null,
              audioPeakDb: null,
              audioLoudnessDb: null,
              audioBackgroundTrack: null,
              audioUrl: slide.audioUrl || null,
              audioDuration: slide.duration || null,
            }))}
            narrationJobId={narrationState.jobId}
            isCompleted={narrationState.status === "completed"}
            voiceSettings={voiceSettings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
