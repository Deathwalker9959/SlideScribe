/* global PowerPoint */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@ui/button";
import {
  Loader2,
  Music,
  CheckCircle,
} from "lucide-react";
import { DebugPanel } from "@components/DebugPanel";
import { ProgressPanel, ProgressSnapshot, ConnectionStatus } from "@components/ProgressPanel";
import { SlideScript, RefinementMode, SlideAudioTimelineEntry, SlideAudioExport } from "@components/ScriptEditor";
import { ExportPanel } from "@components/ExportPanel";
import { embedPreparedSlideAudio, prepareSlideAudioSources } from "@utils/embedNarration";
import { JobProvider, useJobState, useActiveJob, useJobActions } from "../state/jobManager";
import { ErrorBoundary, OfficeJSErrorBoundary, NetworkErrorBoundary } from "@ui/error-boundary";
import { LoadingOverlay } from "@ui/loading";
import { EnhancedAuthPanel } from "@components/EnhancedAuthPanel";
import { LoginView } from "@components/views/LoginView";
import { InitialView } from "@components/views/InitialView";
import { ScriptView } from "@components/views/ScriptView";
import { SettingsView } from "@components/views/SettingsView";
import { NarrationHeader } from "@components/NarrationHeader";
import { NarrationToast } from "@components/NarrationToast";
import { NarrationStatusBar } from "@components/NarrationStatusBar";
import { useAuth } from "../hooks/useAuth";
import { useNavigation } from "../hooks/useNavigation";
import { useVoiceSettings } from "../hooks/useVoiceSettings";
import { useSlideManagement } from "../hooks/useSlideManagement";
import { useJobTracking } from "../hooks/useJobTracking";
import { NarrationService } from "../services/narrationService";
import { PowerPointService } from "../services/powerPointService";
import {
  ManifestCache,
  ManifestCacheEntry,
  applyManifestToSlides,
  extractPresentationId,
  normalizeAudioExports,
  normalizeJobExportsResponse,
  normalizeTimeline,
  parseManifestCache,
  serializeManifestCache,
} from "../services/manifestService";

declare global {
  interface Window {
    __SLIDESCRIBE_BACKEND_URL__?: string;
    __SLIDESCRIBE_PROGRESS_WS__?: string;
  }
}

const HISTORY_LIMIT = 25;
const MANIFEST_STORAGE_KEY = "slidescribe-manifest-cache";
const PRESENTATION_ID_STORAGE_KEY = "slidescribe-presentation-id";
const INCLUDE_IMAGES_STORAGE_KEY = "slidescribe-include-images";
const DEFAULT_PRESENTATION_ID = "addin-preview";
const DEFAULT_PRESENTATION_TITLE = "Narration Assistant";

const LANGUAGE_OPTIONS = [
  { code: "en-US", name: "English (US)" },
  { code: "el-GR", name: "Greek (Greece)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "fr-FR", name: "French (France)" },
  { code: "de-DE", name: "German (Germany)" },
  { code: "it-IT", name: "Italian (Italy)" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "zh-CN", name: "Chinese (China)" },
  { code: "ja-JP", name: "Japanese (Japan)" },
];

// Temporarily disabled â€” debug-oriented progress panel, not suitable for production UI.
const PROGRESS_VIEW_ENABLED = false;

type CompletionToastState = {
  jobId: string;
  message: string;
  visible: boolean;
  createdAt: string;
};

const calculateMetrics = PowerPointService.calculateMetrics;
const computeContentHash = PowerPointService.computeContentHash;
const extractSlidesFromPowerPoint = () => PowerPointService.extractSlides();
const isPowerPointRuntime = () => PowerPointService.isAvailable();
const getSelectedSlideNumber = () => PowerPointService.getSelectedSlideNumber();

export function NarrationAssistant() {
  // Use the new job state management
  const { state: jobState, dispatch: jobDispatch } = useJobState();
  const { createJob, updateJobStatus, updateJobProgress, setJobError, setLoading } =
    useJobActions();
  const activeJob = useActiveJob();

  const narrationService = useMemo(() => new NarrationService("http://localhost:8000"), []);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const {
    slideScripts,
    setSlideScripts,
    refreshSlides,
    updateSlide,
    statusMessage,
    setStatusMessage,
  } = useSlideManagement();

  const {
    voiceSettings,
    setVoiceSettings,
    handleVoicePreview,
    changeLanguage,
  } = useVoiceSettings(narrationService, setStatusMessage, setLastError);

  const {
    currentView,
    viewHistory,
    navigateToView,
    navigateBack,
    goToProgressView,
    setCurrentView,
  } = useNavigation("login", {
    progressViewEnabled: PROGRESS_VIEW_ENABLED,
    onStatusMessage: setStatusMessage,
    onVoiceLanguageChange: changeLanguage,
    voiceLanguage: voiceSettings.language,
  });

  const {
    isAuthenticated,
    authUser,
    isDevelopment,
    setIsDevelopment,
    handleLogin,
    handleLogout: authLogout,
  } = useAuth(setCurrentView, setStatusMessage);

  const [jobIdInput, setJobIdInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [presentationId, setPresentationId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_PRESENTATION_ID;
    }
    try {
      return window.localStorage.getItem(PRESENTATION_ID_STORAGE_KEY) ?? DEFAULT_PRESENTATION_ID;
    } catch (error) {
      console.warn("Unable to load stored presentation id", error);
      return DEFAULT_PRESENTATION_ID;
    }
  });
  const [progressHistory, setProgressHistory] = useState<ProgressSnapshot[]>([]);
  const [jobAudioExports, setJobAudioExports] = useState<SlideAudioExport[]>([]);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);
  const [completionToast, setCompletionToast] = useState<CompletionToastState | null>(null);
  const [isEmbeddingNarration, setIsEmbeddingNarration] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [isStartingQuickJob, setIsStartingQuickJob] = useState(false);
  const [previewingSlideId, setPreviewingSlideId] = useState<string | null>(null);
  const [refiningSlideId, setRefiningSlideId] = useState<string | null>(null);
  const [isRefreshingContext, setIsRefreshingContext] = useState(false);
  const [includeImages, setIncludeImages] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    try {
      const stored = window.localStorage.getItem(INCLUDE_IMAGES_STORAGE_KEY);
      return stored === null ? true : stored === "true";
    } catch (error) {
      console.warn("Unable to load include images preference", error);
      return true;
    }
  });
  const manifestLoadedJobRef = useRef<string | null>(null);
  const completionToastJobRef = useRef<string | null>(null);
  const completionToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePresentationId = useCallback((nextId: string | null) => {
    if (!nextId) {
      return;
    }
    setPresentationId((current) => {
      if (current === nextId) {
        return current;
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PRESENTATION_ID_STORAGE_KEY, nextId);
        } catch (error) {
          console.warn("Unable to persist presentation id", error);
        }
      }
      return nextId;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(INCLUDE_IMAGES_STORAGE_KEY, includeImages ? "true" : "false");
    } catch (error) {
      console.warn("Unable to persist include images preference", error);
    }
  }, [includeImages]);

  useEffect(() => {
    return () => {
      if (completionToastTimeoutRef.current) {
        clearTimeout(completionToastTimeoutRef.current);
        completionToastTimeoutRef.current = null;
      }
    };
  }, []);

  const buildWebSocketUrl = useCallback((clientId: string) => {
    const overrides: (string | undefined)[] = [
      window.__SLIDESCRIBE_PROGRESS_WS__,
      window.__SLIDESCRIBE_BACKEND_URL__,
      `${window.location.origin}`,
      "http://localhost:8000",
    ];

    for (const base of overrides) {
      if (!base) continue;
      try {
        const url = new URL(base, window.location.href);
        const isDirectWs = url.protocol.startsWith("ws");

        if (!isDirectWs) {
          url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        }

        const normalizedPath = url.pathname.endsWith("/ws/progress")
          ? url.pathname
          : `${url.pathname.replace(/\/$/, "")}/ws/progress`;

        url.pathname = normalizedPath;
        url.searchParams.set("client_id", clientId);
        return url.toString();
      } catch (error) {
        console.warn("Unable to build WebSocket URL from base", base, error);
      }
    }

    const fallbackProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${fallbackProtocol}//${window.location.host}/ws/progress?client_id=${clientId}`;
  }, []);

  const jobTracking = useJobTracking({
    buildWebSocketUrl,
    historyLimit: HISTORY_LIMIT,
    onProgress: (snapshot) => {
      setProgressHistory((current) => {
        const next = [snapshot, ...current];
        return next.length > HISTORY_LIMIT ? next.slice(0, HISTORY_LIMIT) : next;
      });
      if ((snapshot.status === "completed" || snapshot.status === "failed") && snapshot.jobId) {
        refreshContextFromManifest(snapshot.jobId);
      }
    },
    onApplyResult: (payload) => {
      const resultPayload = payload.result ?? payload.slide_result;
      if (resultPayload && (resultPayload.slide_id || payload.slide_id)) {
        const hasRefinedContent =
          typeof resultPayload.refined_content === "string" &&
          resultPayload.refined_content.trim().length > 0;
        const hasContextualMetadata = Boolean(resultPayload.contextual_metadata);
        if (hasRefinedContent || hasContextualMetadata) {
          const slideIdentifier = resultPayload.slide_id ?? payload.slide_id;
          if (slideIdentifier) {
            applySlideProcessingResult(slideIdentifier, resultPayload);
          }
        }
      }
      const audioPayload =
        resultPayload?.audio_metadata ?? resultPayload?.audio ?? payload.audio ?? undefined;
      const exportEntries = mapExportsWithResolvedUrl(normalizeAudioExports(audioPayload?.exports));
      if (exportEntries.length > 0) {
        setJobAudioExports(exportEntries);
      }
    },
    onManifestRefresh: async (jobId) => {
      await refreshContextFromManifest(jobId);
    },
    onSetActiveJob: setActiveJobId,
    onStatus: setStatusMessage,
    onError: setLastError,
  });

  const buildBackendHttpUrl = useCallback((path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const candidates = [
      window.__SLIDESCRIBE_BACKEND_URL__,
      window.location.origin,
      "http://localhost:8000",
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate, window.location.href);
        url.pathname = `${url.pathname.replace(/\/$/, "")}${normalizedPath}`;
        return url.toString();
      } catch (error) {
        console.warn("Unable to construct backend URL from candidate", candidate, error);
      }
    }

    return `http://localhost:8000${normalizedPath}`;
  }, []);

  const resolveDownloadUrl = useCallback(
    (url: string | undefined): string | undefined => {
      if (!url) {
        return undefined;
      }
      if (typeof window === "undefined") {
        return url;
      }
      try {
        const candidate = new URL(url, window.location.origin);
        if (!candidate.protocol.startsWith("http")) {
          return buildBackendHttpUrl(candidate.pathname + candidate.search);
        }
        return candidate.toString();
      } catch {
        return buildBackendHttpUrl(url);
      }
    },
    [buildBackendHttpUrl]
  );

  const resolveMediaUrl = useCallback(
    (url: string | undefined): string | undefined => {
      if (!url) {
        return undefined;
      }
      if (/^https?:\/\//i.test(url)) {
        return url;
      }
      if (url.startsWith("/")) {
        return buildBackendHttpUrl(url);
      }
      return buildBackendHttpUrl(`/${url}`);
    },
    [buildBackendHttpUrl]
  );

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }, []);

  const fetchAudioAsBase64 = useCallback(
    async (audioUrl: string) => {
      const resolved = resolveMediaUrl(audioUrl);
      if (!resolved) {
        throw new Error("Audio URL could not be resolved");
      }
      const response = await fetch(resolved);
      if (!response.ok) {
        throw new Error(`Audio download failed with status ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return arrayBufferToBase64(buffer);
    },
    [arrayBufferToBase64, resolveMediaUrl]
  );

  const embedNarrationIntoPresentation = useCallback(async () => {
    if (!activeJobId) {
      setLastError("Track a narration job before embedding audio.");
      return;
    }
    if (typeof PowerPoint === "undefined" || typeof PowerPoint.run !== "function") {
      setLastError(
        "PowerPoint APIs are unavailable. Open this add-in inside PowerPoint to embed audio."
      );
      return;
    }
    if (isEmbeddingNarration) {
      return;
    }

    // Check if we have slide scripts with audio
    const slidesWithAudio = slideScripts.filter(slide => slide.audioUrl);
    if (slidesWithAudio.length === 0) {
      setLastError("No audio available to embed. Please complete narration generation first.");
      return;
    }

    setIsEmbeddingNarration(true);
    setStatusMessage(`Preparing audio for ${slidesWithAudio.length} slide${slidesWithAudio.length === 1 ? "" : "s"}...`);

    try {
      // Prepare slide audio sources
      const { prepared, failedSlides } = await prepareSlideAudioSources(
        slideScripts.map((slide) => ({
          slideId: slide.slideId,
          slideNumber: slide.slideNumber,
          audioUrl: slide.audioUrl ?? undefined,
        })),
        async (audioUrl: string) => {
          setStatusMessage("Downloading audio files...");
          const base64 = await fetchAudioAsBase64(audioUrl);
          return base64;
        }
      );

      if (prepared.length === 0) {
        setLastError("Failed to prepare any audio files for embedding.");
        setStatusMessage(null);
        return;
      }

      setStatusMessage(`Embedding audio into ${prepared.length} slide${prepared.length === 1 ? "" : "s"}...`);

      // Embed the prepared audio
      await embedPreparedSlideAudio(PowerPoint as any, prepared);

      // Calculate final results
      const totalSlides = slideScripts.length;
      const embeddedSlides = prepared.length;
      const noAudioSlides = failedSlides.length;

      // Provide comprehensive status message
      let statusMessage = "";
      if (embeddedSlides === totalSlides) {
        statusMessage = `âœ… Successfully embedded narration audio into all ${embeddedSlides} slides!`;
      } else if (embeddedSlides > 0) {
        statusMessage = `âœ… Embedded audio into ${embeddedSlides} of ${totalSlides} slides.`;
        if (noAudioSlides > 0) {
          const failedNumbers = Array.from(new Set(failedSlides)).sort((a, b) => a - b);
          statusMessage += ` No audio available for slides: ${failedNumbers.join(", ")}.`;
        }
      } else {
        statusMessage = "âš ï¸ No audio was embedded. Check narration generation status.";
      }

      // Add helpful tips
      if (embeddedSlides > 0) {
        statusMessage += " Audio icons will auto-play when slides are presented.";
      }

      setStatusMessage(statusMessage);
      setLastError(null);

      // Log success for debugging
      console.log(`Narration embedding complete: ${embeddedSlides}/${totalSlides} slides processed`);

    } catch (error) {
      console.error("Failed to embed narration audio", error);
      let errorMessage = "Failed to embed narration audio.";

      if (error instanceof Error) {
        if (error.message.includes("not supported")) {
          errorMessage = "Audio embedding requires PowerPoint for Microsoft 365. Please update your PowerPoint version.";
        } else if (error.message.includes("unavailable")) {
          errorMessage = "PowerPoint APIs are unavailable. Please reopen this add-in in PowerPoint and try again.";
        } else {
          errorMessage = error.message;
        }
      }

      setLastError(errorMessage);
      setStatusMessage(null);
    } finally {
      setIsEmbeddingNarration(false);
    }
  }, [
    activeJobId,
    fetchAudioAsBase64,
    isEmbeddingNarration,
    slideScripts,
    setLastError,
    setStatusMessage,
  ]);

  const dismissCompletionToast = useCallback(() => {
    setCompletionToast(null);
    if (completionToastTimeoutRef.current) {
      clearTimeout(completionToastTimeoutRef.current);
      completionToastTimeoutRef.current = null;
    }
  }, []);

  const handleViewSummaryFromToast = useCallback(() => {
    goToProgressView();
    dismissCompletionToast();
  }, [dismissCompletionToast, goToProgressView]);

  const handleEmbedFromToast = useCallback(() => {
    goToProgressView();
    dismissCompletionToast();
    if (isEmbeddingNarration) {
      return;
    }
    void embedNarrationIntoPresentation();
  }, [dismissCompletionToast, embedNarrationIntoPresentation, isEmbeddingNarration, goToProgressView]);

  const mapExportsWithResolvedUrl = useCallback(
    (exports: SlideAudioExport[] | undefined) => {
      if (!exports) {
        return [];
      }
      return exports.map((exportInfo) => ({
        ...exportInfo,
        resolvedUrl: resolveDownloadUrl(exportInfo.downloadUrl ?? exportInfo.path),
      }));
    },
    [resolveDownloadUrl]
  );

  const fetchJobAudioExports = useCallback(
    async (jobId: string) => {
      if (!jobId) {
        return;
      }
      try {
        const requestUrl = buildBackendHttpUrl(`/api/v1/audio/exports/${jobId}`);
        const response = await fetch(requestUrl, {
          headers: {
            Authorization: "Bearer test_token",
          },
        });
        if (!response.ok) {
          throw new Error(`Export list failed with status ${response.status}`);
        }
        const data = await response.json();
        const normalized = mapExportsWithResolvedUrl(normalizeJobExportsResponse(data));
        if (normalized.length > 0) {
          setJobAudioExports(normalized);
        }
      } catch (error) {
        console.warn("Failed to load job audio exports", error);
      }
    },
    [buildBackendHttpUrl, mapExportsWithResolvedUrl]
  );

  const applyManifestData = useCallback(
    (
      jobId: string,
      data: any,
      options?: { source?: "backend" | "cache"; message?: string; skipStatus?: boolean }
    ) => {
      setSlideScripts((current) => {
        const { slides: nextSlides, audioExports, presentationId: manifestPresentationId } =
          applyManifestToSlides({
            slides: current,
            manifest: data,
            mapExportsWithResolvedUrl,
          });
        setJobAudioExports(audioExports);
        if (manifestPresentationId) {
          updatePresentationId(manifestPresentationId);
        }
        return nextSlides;
      });

      manifestLoadedJobRef.current = jobId;
      if (!options?.skipStatus) {
        const message =
          options?.message ??
          (options?.source === "cache"
            ? "Contextual insights loaded from cache."
            : "Contextual insights refreshed from backend manifest.");
        setStatusMessage(message);
      }
      setLastError(null);
    },
    [updatePresentationId, mapExportsWithResolvedUrl, setJobAudioExports]
  );

  const refreshContextFromManifest = useCallback(
    async (jobId: string, options?: { force?: boolean; showStatus?: boolean }) => {
      if (!jobId) {
        return;
      }
      if (!options?.force && manifestLoadedJobRef.current === jobId) {
        return;
      }

      const showStatus = Boolean(options?.showStatus);
      if (showStatus) {
        setIsRefreshingContext(true);
        setStatusMessage("Refreshing contextual insights from backend...");
      }

      try {
        const requestUrl = buildBackendHttpUrl(`/api/v1/narration/manifest/${jobId}`);
        const response = await fetch(requestUrl, {
          headers: {
            Authorization: "Bearer test_token",
          },
        });

        if (!response.ok) {
          throw new Error(`Manifest fetch failed with status ${response.status}`);
        }

        const data = await response.json();
        applyManifestData(jobId, data, {
          source: "backend",
          message: showStatus ? "Contextual insights refreshed." : undefined,
        });

        const manifestPresentationId = extractPresentationId(data) ?? presentationId;
        if (typeof window !== "undefined") {
          try {
            const existing = parseManifestCache(window.localStorage.getItem(MANIFEST_STORAGE_KEY));
            const entry: ManifestCacheEntry = {
              jobId,
              manifest: data,
              presentationId: manifestPresentationId ?? undefined,
              updatedAt: new Date().toISOString(),
            };
            existing.jobs[jobId] = entry;
            if (manifestPresentationId) {
              existing.presentations[manifestPresentationId] = entry;
            }
            window.localStorage.setItem(MANIFEST_STORAGE_KEY, serializeManifestCache(existing));
          } catch (cacheError) {
            console.warn("Failed to cache manifest locally", cacheError);
          }
        }

        await fetchJobAudioExports(jobId);
      } catch (error) {
        console.warn("Manifest refresh error", error);
        if (showStatus) {
          setStatusMessage("Unable to refresh contextual insights.");
        }
        if (manifestLoadedJobRef.current === jobId) {
          manifestLoadedJobRef.current = null;
        }
      } finally {
        if (showStatus) {
          setIsRefreshingContext(false);
        }
      }
    },
    [applyManifestData, buildBackendHttpUrl, fetchJobAudioExports, presentationId]
  );

  const handleAddImageAttachment = useCallback(async (slideId: string, file: File) => {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          const [, encoded = ""] = result.split(",");
          resolve(encoded);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });

      setSlideScripts((current) =>
        current.map((slide) => {
          if (slide.slideId !== slideId) {
            return slide;
          }
          const attachments = slide.imageAttachments ?? [];
          const id = `${slideId}-${Date.now()}`;
          return {
            ...slide,
            imageAttachments: [
              ...attachments,
              {
                id,
                name: file.name,
                mimeType: file.type || "image/png",
                base64,
                size: file.size,
              },
            ],
          } satisfies SlideScript;
        })
      );
    } catch (error) {
      console.warn("Failed to attach slide image", error);
      setLastError("Unable to attach slide image.");
    }
  }, []);

  const handleRemoveImageAttachment = useCallback((slideId: string, attachmentId: string) => {
    setSlideScripts((current) =>
      current.map((slide) => {
        if (slide.slideId !== slideId) {
          return slide;
        }
        return {
          ...slide,
          imageAttachments: (slide.imageAttachments ?? []).filter(
            (attachment) => attachment.id !== attachmentId
          ),
        } satisfies SlideScript;
      })
    );
  }, []);

  const applySlideProcessingResult = useCallback(
    (slideId: string, result: any) => {
      console.log("[applySlideProcessingResult] Called", { slideId, result });

      setSlideScripts((current) =>
        current.map((slide) => {
          if (slide.slideId !== slideId) {
            return slide;
          }

          console.log("[applySlideProcessingResult] Found matching slide", slide.slideId);
          const next: SlideScript = { ...slide };
          const sourceContent =
            typeof result?.original_content === "string" && result.original_content.trim().length > 0
              ? result.original_content
              : slide.originalText;

          if (
            typeof result?.refined_content === "string" &&
            result.refined_content.trim().length > 0
          ) {
            console.log("[applySlideProcessingResult] Applying refined_content", result.refined_content);
            const { wordCount, durationSeconds } = calculateMetrics(result.refined_content);
            next.refinedScript = result.refined_content;
            next.wordCount = wordCount;
            next.duration = durationSeconds;
            next.updatedAt = new Date().toISOString();
            next.contentHash = computeContentHash(sourceContent);
          } else {
            console.log("[applySlideProcessingResult] No valid refined_content");
          }

          const meta = result?.contextual_metadata;
          if (meta) {
            const callouts = Array.isArray(meta.callouts) ? meta.callouts : [];
            next.contextualHighlights = Array.isArray(meta.highlights)
              ? meta.highlights
              : (next.contextualHighlights ?? []);
            next.contextualCallouts = callouts;
            next.imageReferences = Array.isArray(meta.image_references)
              ? meta.image_references
              : [];
            next.contextualTransitions =
              meta.transitions && typeof meta.transitions === "object" ? meta.transitions : {};
            next.contextConfidence =
              typeof meta.confidence === "number"
                ? Math.max(0, Math.min(1, meta.confidence))
                : (next.contextConfidence ?? null);
            next.contextualUpdatedAt = new Date().toISOString();
          }

          const audioPayload = result?.audio_metadata ?? result?.audio ?? null;
          if (audioPayload) {
            const timelineEntries = normalizeTimeline(audioPayload.timeline);
            if (timelineEntries.length > 0) {
              next.audioTimeline = timelineEntries;
            }
            const exportEntries = mapExportsWithResolvedUrl(
              normalizeAudioExports(audioPayload.exports)
            );
            if (exportEntries.length > 0) {
              next.audioExports = exportEntries;
              setJobAudioExports(exportEntries);
            }
            if (audioPayload.output_path || audioPayload.combined_output_path) {
              next.audioMixPath =
                audioPayload.output_path ??
                audioPayload.combined_output_path ??
                next.audioMixPath ??
                null;
            }
            if (typeof audioPayload.output_peak_dbfs === "number") {
              next.audioPeakDb = audioPayload.output_peak_dbfs;
            }
            if (typeof audioPayload.output_loudness_dbfs === "number") {
              next.audioLoudnessDb = audioPayload.output_loudness_dbfs;
            }
            if (audioPayload.background_track_path) {
              next.audioBackgroundTrack = audioPayload.background_track_path;
            }
            if (audioPayload.audio_url || audioPayload.url || audioPayload.path) {
              next.audioUrl =
                audioPayload.audio_url ??
                audioPayload.url ??
                audioPayload.path ??
                next.audioUrl ??
                null;
            }
            if (typeof audioPayload.duration === "number") {
              next.audioDuration = audioPayload.duration;
            }
          }

          return next;
        })
      );
    },
    [mapExportsWithResolvedUrl, setJobAudioExports]
  );

  const fetchSlideInsights = useCallback(
    async (slide: SlideScript, refinedText?: string) => {
      try {
        const requestUrl = buildBackendHttpUrl("/api/v1/narration/process-slide");
        const imagesPayload = includeImages
          ? (slide.imageAttachments ?? []).map((attachment) => ({
              image_id: attachment.id,
              description: attachment.name,
              mime_type: attachment.mimeType,
              content_base64: attachment.base64,
            }))
          : [];
        const payload = {
          presentation_id: presentationId,
          presentation_title: DEFAULT_PRESENTATION_TITLE,
          slide_id: slide.slideId,
          slide_number: slide.slideNumber,
          slide_title: `Slide ${slide.slideNumber}`,
          slide_content: refinedText ?? slide.refinedScript ?? slide.originalText,
          slide_notes: null,
          slide_layout: null,
          images: imagesPayload,
          total_slides: slideScripts.length,
          topic_keywords: [],
        };

        const response = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test_token",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Context analysis failed with status ${response.status}`);
        }

        const data = await response.json();
        const result = data?.result ?? data;
        if (result) {
          applySlideProcessingResult(slide.slideId, result);
          setStatusMessage(`Contextual insights updated for slide ${slide.slideNumber}.`);
          setLastError(null);
        }
      } catch (error) {
        console.warn("Slide context analysis error", error);
        setStatusMessage("Refinement saved. Contextual insights unavailable.");
      }
    },
    [
      applySlideProcessingResult,
      buildBackendHttpUrl,
      presentationId,
      slideScripts.length,
      setLastError,
      setStatusMessage,
      includeImages,
    ]
  );


  const handleSlideUpdate = useCallback(
    (updated: SlideScript) => {
      updateSlide(updated);
      setLastError(null);
    },
    [updateSlide]
  );

  const handlePreviewSlide = useCallback(
    async (slide: SlideScript) => {
      setPreviewingSlideId(slide.slideId);
      setStatusMessage(null);
      setLastError(null);

      try {
        const requestUrl = buildBackendHttpUrl("/api/v1/tts/synthesize");
        const response = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test_token",
          },
          body: JSON.stringify({
            text: slide.refinedScript,
            voice: voiceSettings.voiceName,
            driver: voiceSettings.provider,
            speed: voiceSettings.speed,
            pitch: voiceSettings.pitch,
            output_format: "mp3",
            volume: voiceSettings.volume,
            language: voiceSettings.language,
          }),
        });

        if (!response.ok) {
          throw new Error(`Preview failed with status ${response.status}`);
        }

        const data = await response.json();
        setStatusMessage(
          data?.audio_url
            ? "Preview generated. Audio available from backend."
            : "Preview request completed."
        );
      } catch (error) {
        console.error("Preview error", error);
        setLastError(error instanceof Error ? error.message : "Failed to generate preview.");
      } finally {
        setPreviewingSlideId(null);
      }
    },
    [buildBackendHttpUrl, voiceSettings]
  );

  const handleRefineSlide = useCallback(
    async (slide: SlideScript, mode: RefinementMode) => {
      setRefiningSlideId(slide.slideId);
      setStatusMessage(null);
      setLastError(null);

      try {
        const requestUrl = buildBackendHttpUrl("/api/v1/ai-refinement/refine");
        const response = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test_token",
          },
          body: JSON.stringify({
            text: slide.refinedScript || slide.originalText,
            refinement_type: mode,
            language: voiceSettings.language,
            tone: voiceSettings.tone,
          }),
        });

        if (!response.ok) {
          throw new Error(`Refinement failed with status ${response.status}`);
        }

        const data = await response.json();
        const refinedText = data?.refined_text ?? slide.refinedScript;
        const { wordCount, durationSeconds } = calculateMetrics(refinedText);
        const updatedSlide: SlideScript = {
          ...slide,
          refinedScript: refinedText,
          contentHash: slide.contentHash ?? computeContentHash(slide.originalText),
          wordCount,
          duration: durationSeconds,
          updatedAt: new Date().toISOString(),
        };
        handleSlideUpdate(updatedSlide);
        setStatusMessage("Slide refined. Updating contextual insights...");
        await fetchSlideInsights(updatedSlide, refinedText);
      } catch (error) {
        console.error("Refinement error", error);
        setLastError(error instanceof Error ? error.message : "Failed to refine slide.");
      } finally {
        setRefiningSlideId(null);
      }
    },
    [buildBackendHttpUrl, voiceSettings, handleSlideUpdate, fetchSlideInsights]
  );

  const handleStartTracking = useCallback(
    (jobIdOverride?: string, options?: { preserveState?: boolean }) => {
      const jobId = jobIdOverride ?? jobIdInput;
      const trimmedJobId = jobId.trim();
      if (!trimmedJobId) {
        setLastError("Please enter a job ID to track.");
        return;
      }

      if (jobIdOverride && jobIdInput !== trimmedJobId) {
        setJobIdInput(trimmedJobId);
      }

      if (!options?.preserveState) {
        setLastError(null);
        setProgressHistory([]);
        manifestLoadedJobRef.current = null;
        setCompletionToast(null);
        if (completionToastTimeoutRef.current) {
          clearTimeout(completionToastTimeoutRef.current);
          completionToastTimeoutRef.current = null;
        }
        completionToastJobRef.current = null;
        setJobAudioExports([]);
        setShowCompletionSummary(false);
      } else {
        setLastError(null);
      }

      jobTracking.handleStartTracking(trimmedJobId, options);
    },
    [jobIdInput, jobTracking.handleStartTracking, setJobAudioExports, setJobIdInput, setProgressHistory]
  );

  const handleStopTracking = useCallback(() => {
    jobTracking.handleStopTracking();
    setShowCompletionSummary(false);
    setCompletionToast(null);
    if (completionToastTimeoutRef.current) {
      clearTimeout(completionToastTimeoutRef.current);
      completionToastTimeoutRef.current = null;
    }
    completionToastJobRef.current = null;
    manifestLoadedJobRef.current = null;
    setJobAudioExports([]);
  }, [jobTracking.handleStopTracking, setJobAudioExports]);

  const startNarrationJob = useCallback(async () => {
    if (isStartingJob) {
      return;
    }

    setIsStartingJob(true);
    setLastError(null);
    setStatusMessage("Starting narration job...");

    try {
      // Always try to refresh from PowerPoint before sending to backend
      let slidesForJob = slideScripts;
      if (isPowerPointRuntime()) {
        try {
          slidesForJob = await refreshSlides();
        } catch (refreshError) {
          console.warn("Slide reload before narration failed", refreshError);
        }
      }

      const sanitizedSlides = slidesForJob.filter(
        (slide) => slide.originalText.trim() !== "Welcome to our presentation. This is the first slide."
      );

      if (sanitizedSlides.length !== slidesForJob.length) {
        setSlideScripts(sanitizedSlides);
        console.warn("Removed placeholder slides before starting narration.");
      }

      if (sanitizedSlides.length === 0) {
        if (!isPowerPointRuntime()) {
          throw new Error("No slides available. Open this add-in inside PowerPoint and try again.");
        }
        throw new Error("Add slide scripts before starting narration.");
      }

      const requestUrl = buildBackendHttpUrl("/api/v1/narration/process-presentation");
      const slidesPayload = sanitizedSlides.map((slide) => {
        const slideTitle =
          slide.originalText?.split(/\r?\n/)[0]?.trim() || `Slide ${slide.slideNumber}`;
        const currentContentHash = computeContentHash(slide.originalText);
        const scriptHash = slide.contentHash ?? currentContentHash;
        const hasRefinedScript =
          typeof slide.refinedScript === "string" && slide.refinedScript.trim().length > 0;
        const useRefinedScript = hasRefinedScript && scriptHash === currentContentHash;
        const slideContent = useRefinedScript ? slide.refinedScript : slide.originalText;

        return {
          slide_id: slide.slideId,
          title: slideTitle,
          content: slideContent,
          notes: null,
          images: includeImages
            ? (slide.imageAttachments ?? []).map((attachment) => ({
                image_id: attachment.id,
                description: attachment.name,
                mime_type: attachment.mimeType,
                content_base64: attachment.base64,
              }))
            : [],
        };
      });

      const payload = {
        slides: slidesPayload,
        settings: {
          provider: voiceSettings.provider,
          voice: voiceSettings.voiceName,
          speed: voiceSettings.speed,
          pitch: voiceSettings.pitch,
          volume: voiceSettings.volume,
          tone: voiceSettings.tone,
          language: voiceSettings.language,
        },
        metadata: {
          source: "office-addin",
          requested_at: new Date().toISOString(),
          presentation_id: presentationId,
        },
      };

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test_token",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`);
      }

      const data = await response.json();
      const newJobId = data.job_id;
      if (!newJobId) {
        throw new Error("Backend response missing job ID");
      }

      setJobIdInput(newJobId);
      setActiveJobId(newJobId);
      setProgressHistory([]);
      setJobAudioExports([]);
      setShowCompletionSummary(false);
      manifestLoadedJobRef.current = null;
      setCompletionToast(null);
      if (completionToastTimeoutRef.current) {
        clearTimeout(completionToastTimeoutRef.current);
        completionToastTimeoutRef.current = null;
      }
      completionToastJobRef.current = null;
      setStatusMessage(`Narration job ${newJobId} started.`);
      setCurrentView("script");
      handleStartTracking(newJobId);
    } catch (error) {
      console.error("Failed to start narration job", error);
      setLastError(error instanceof Error ? error.message : "Failed to start narration job.");
      setStatusMessage(null);
    } finally {
      setIsStartingJob(false);
    }
  }, [
    isStartingJob,
    buildBackendHttpUrl,
    slideScripts,
    voiceSettings,
    handleStartTracking,
    presentationId,
    includeImages,
    refreshSlides,
  ]);

  const startQuickNarrationForCurrentSlide = useCallback(async () => {
    if (isStartingQuickJob) {
      return;
    }

    setIsStartingQuickJob(true);
    setLastError(null);
    setStatusMessage("Starting narration for current slide...");

    try {
      let slidesForJob = slideScripts;
      if (isPowerPointRuntime()) {
        try {
          slidesForJob = await refreshSlides();
        } catch (refreshError) {
          console.warn("Slide reload before quick narration failed", refreshError);
        }
      }

      const sanitizedSlides = slidesForJob.filter(
        (slide) => slide.originalText.trim() !== "Welcome to our presentation. This is the first slide."
      );

      if (sanitizedSlides.length === 0) {
        if (!isPowerPointRuntime()) {
          throw new Error("No slides available. Open this add-in inside PowerPoint and select a slide.");
        }
        throw new Error("No slide content available. Make sure a slide is selected.");
      }

      const selectedNumber = await getSelectedSlideNumber();
      const targetSlide =
        (selectedNumber
          ? sanitizedSlides.find((slide) => slide.slideNumber === selectedNumber)
          : null) ?? sanitizedSlides[0];

      if (!targetSlide || !targetSlide.originalText.trim()) {
        throw new Error("Selected slide has no content.");
      }

      const requestUrl = buildBackendHttpUrl("/api/v1/narration/process-presentation");
      const slideTitle =
        targetSlide.originalText?.split(/\r?\n/)[0]?.trim() || `Slide ${targetSlide.slideNumber}`;
      const slidePayload = {
        slide_id: targetSlide.slideId,
        title: slideTitle,
        content: targetSlide.refinedScript && targetSlide.refinedScript.trim().length > 0
          ? targetSlide.refinedScript
          : targetSlide.originalText,
        notes: null,
        images: includeImages
          ? (targetSlide.imageAttachments ?? []).map((attachment) => ({
              image_id: attachment.id,
              description: attachment.name,
              mime_type: attachment.mimeType,
              content_base64: attachment.base64,
            }))
          : [],
      };

      const payload = {
        slides: [slidePayload],
        settings: {
          provider: voiceSettings.provider,
          voice: voiceSettings.voiceName,
          speed: voiceSettings.speed,
          pitch: voiceSettings.pitch,
          volume: voiceSettings.volume,
          tone: voiceSettings.tone,
          language: voiceSettings.language,
        },
        metadata: {
          source: "office-addin",
          requested_at: new Date().toISOString(),
          presentation_id: presentationId,
        },
      };

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test_token",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`);
      }

      const data = await response.json();
      const newJobId = data.job_id;
      if (!newJobId) {
        throw new Error("Backend response missing job ID");
      }

      setJobIdInput(newJobId);
      setActiveJobId(newJobId);
      setProgressHistory([]);
      setJobAudioExports([]);
      setShowCompletionSummary(false);
      manifestLoadedJobRef.current = null;
      setCompletionToast(null);
      if (completionToastTimeoutRef.current) {
        clearTimeout(completionToastTimeoutRef.current);
        completionToastTimeoutRef.current = null;
      }
      completionToastJobRef.current = null;
      setStatusMessage(`Narration job ${newJobId} started for current slide.`);
      setCurrentView("script");
      handleStartTracking(newJobId);
    } catch (error) {
      console.error("Failed to start quick narration", error);
      setLastError(error instanceof Error ? error.message : "Failed to start narration.");
      setStatusMessage(null);
    } finally {
      setIsStartingQuickJob(false);
    }
  }, [
    isStartingQuickJob,
    buildBackendHttpUrl,
    slideScripts,
    voiceSettings,
    handleStartTracking,
    presentationId,
    includeImages,
    refreshSlides,
  ]);

  const latestProgress = progressHistory.length > 0 ? progressHistory[0] : null;
  const disabledVoiceActions =
    isStartingJob || previewingSlideId !== null || refiningSlideId !== null;

  useEffect(() => {
    if (latestProgress?.status === "completed" && latestProgress.jobId) {
      setShowCompletionSummary(true);
      refreshContextFromManifest(latestProgress.jobId);
      fetchJobAudioExports(latestProgress.jobId);

      // Auto-navigate to script view when narration is complete
      setTimeout(() => {
        setCurrentView("script");
        setStatusMessage("Narration completed! You can now refine and edit the generated script.");
      }, 2000); // Show completion summary for 2 seconds then switch

      const now = new Date().toISOString();
      if (completionToastJobRef.current !== latestProgress.jobId) {
        completionToastJobRef.current = latestProgress.jobId;
        setCompletionToast({
          jobId: latestProgress.jobId,
          message: "Narration ready. Download exports or embed narration.",
          visible: true,
          createdAt: now,
        });
      } else {
        setCompletionToast((current) =>
          current
            ? { ...current, visible: true, createdAt: now }
            : {
                jobId: latestProgress.jobId,
                message: "Narration ready. Download exports or embed narration.",
                visible: true,
                createdAt: now,
              }
        );
      }
    }
    if (latestProgress?.status && latestProgress.status !== "completed") {
      setShowCompletionSummary(false);
    }
  }, [latestProgress, refreshContextFromManifest, fetchJobAudioExports]);

  useEffect(() => {
    const jobId = completionToast?.jobId;
    const visible = completionToast?.visible;
    if (!jobId || !visible) {
      return;
    }
    if (completionToastTimeoutRef.current) {
      clearTimeout(completionToastTimeoutRef.current);
    }
    completionToastTimeoutRef.current = setTimeout(() => {
      setCompletionToast((current) => {
        if (!current || current.jobId !== jobId) {
          return current;
        }
        return null;
      });
    }, 6000);
    return () => {
      if (completionToastTimeoutRef.current) {
        clearTimeout(completionToastTimeoutRef.current);
        completionToastTimeoutRef.current = null;
      }
    };
  }, [completionToast?.jobId, completionToast?.visible]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const cache = parseManifestCache(window.localStorage.getItem(MANIFEST_STORAGE_KEY));
      if (activeJobId && manifestLoadedJobRef.current !== activeJobId) {
        const entry = cache.jobs[activeJobId];
        if (entry) {
          applyManifestData(entry.jobId, entry.manifest, {
            source: "cache",
            message: "Contextual insights restored from cached job.",
          });
          return;
        }
      }
      if (presentationId) {
        const entry = cache.presentations[presentationId];
        if (entry && manifestLoadedJobRef.current !== entry.jobId) {
          applyManifestData(entry.jobId, entry.manifest, {
            source: "cache",
            message: "Contextual insights restored for this presentation.",
          });
        }
      }
    } catch (error) {
      console.warn("Failed to load cached manifest", error);
    }
  }, [activeJobId, presentationId, applyManifestData]);

  const handleLogout = useCallback(() => {
    setShowProfileDropdown(false);
    authLogout();
  }, [authLogout]);

  const loadOfficeJsDataAndUpdateSlideScripts = useCallback(async (jobId: string) => {
    try {
      setStatusMessage("Loading narration data...");

      // Fetch Office.js data from backend
      const response = await fetch(`${buildBackendHttpUrl()}/media/${jobId}/office_js_data.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch Office.js data: ${response.status}`);
      }

      const officeJsData = await response.json();

      if (officeJsData.error) {
        throw new Error(`Backend error: ${officeJsData.error}`);
      }

      // Update slideScripts with audio URLs from Office.js data
      setSlideScripts(prevScripts =>
        prevScripts.map(slide => {
          const backendSlide = officeJsData.slides.find(
            (backendSlide: any) => backendSlide.slide_number === slide.slideNumber
          );

          if (backendSlide?.audio?.file_path) {
            return {
              ...slide,
              audioUrl: `${buildBackendHttpUrl()}${backendSlide.audio.file_path}`,
              audioDuration: backendSlide.audio.duration || null,
            };
          }

          return slide;
        })
      );

      setStatusMessage(`Loaded narration data for ${officeJsData.slides.length} slides`);
      return officeJsData.slides.length;

    } catch (error) {
      setLastError(`Failed to load narration data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }, [buildBackendHttpUrl, setLastError, setStatusMessage]);

  // Auto-load Office.js data when job is marked as completed
  useEffect(() => {
    if (latestProgress?.status === 'completed' && latestProgress.jobId) {
      loadOfficeJsDataAndUpdateSlideScripts(latestProgress.jobId);
    }
  }, [latestProgress?.status, latestProgress?.jobId, loadOfficeJsDataAndUpdateSlideScripts]);


  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!showProfileDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".narration-profile-dropdown")) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showProfileDropdown]);

  // Authentication check - show login if not authenticated
  if (!isAuthenticated) {
    return (
      <div
        className="narration-assistant narration-assistant--auth"
        role="main"
        aria-label="SlideScribe Authentication"
      >
        <EnhancedAuthPanel
          onAuthChange={handleLogin}
          className="auth-panel--main"
          autoStart={false}
        />
      </div>
    );
  }

  return (
    <div className="narration-assistant" role="main" aria-label="Narration Assistant">
      {/* Skip to content link for keyboard users */}
      <a
        href="#narration-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("narration-content")?.focus();
        }}
      >
        Skip to main content
      </a>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>

      <div className="narration-container">
        <NarrationToast
          visible={completionToast?.visible ?? false}
          message={completionToast?.message ?? ""}
          onViewSummary={handleViewSummaryFromToast}
          onEmbed={handleEmbedFromToast}
          onDismiss={dismissCompletionToast}
          isEmbedding={isEmbeddingNarration}
        />
        <NarrationHeader
          isAuthenticated={isAuthenticated}
          currentView={currentView}
          viewHistory={viewHistory}
          onNavigateBack={navigateBack}
          onNavigateToView={navigateToView}
          voiceSettings={voiceSettings}
          onVoiceSettingsChange={setVoiceSettings}
          onStatusMessage={setStatusMessage}
          languageOptions={LANGUAGE_OPTIONS}
          progressViewEnabled={PROGRESS_VIEW_ENABLED}
          activeJobId={activeJobId}
          showProfileDropdown={showProfileDropdown}
          onToggleProfileDropdown={() => setShowProfileDropdown(!showProfileDropdown)}
          authUser={authUser}
          onLogout={handleLogout}
          isDevelopment={isDevelopment}
        />
        <NarrationStatusBar
          progressViewEnabled={PROGRESS_VIEW_ENABLED}
          activeJobId={activeJobId}
          latestProgress={latestProgress}
          lastError={lastError}
          statusMessage={statusMessage}
        />

        <div id="narration-content" tabIndex={-1}>
          {PROGRESS_VIEW_ENABLED && currentView === "progress" ? (
            <>
              {showCompletionSummary &&
                (jobAudioExports.length > 0 || slideScripts.some((slide) => slide.audioUrl)) && (
                  <div className="narration-summary-card">
                    <div className="narration-summary-header">
                      <CheckCircle className="narration-summary-icon" />
                      <div>
                        <h3>Narration Ready</h3>
                        <p>Download mixes or embed narration directly into this deck.</p>
                      </div>
                    </div>
                    {jobAudioExports.length > 0 && (
                      <ul className="narration-summary-list">
                        {jobAudioExports.map((exportInfo, index) => (
                          <li key={`summary-export-${exportInfo.format}-${index}`}>
                            <span className="narration-summary-format">
                              {exportInfo.format.toUpperCase()}:
                            </span>
                            {exportInfo.resolvedUrl ? (
                              <a
                                href={exportInfo.resolvedUrl}
                                className="narration-summary-link"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {exportInfo.fileSize
                                  ? `${(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB`
                                  : "Download"}
                              </a>
                            ) : (
                              <span className="narration-summary-meta">Preparingâ€¦</span>
                            )}
                            {exportInfo.createdAt && (
                              <span className="narration-summary-meta">
                                {new Date(exportInfo.createdAt).toLocaleString()}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="narration-summary-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={embedNarrationIntoPresentation}
                        disabled={isEmbeddingNarration}
                      >
                        {isEmbeddingNarration ? (
                          <Loader2 className="narration-summary-action-icon narration-summary-action-icon--spin" />
                        ) : (
                          <Music className="narration-summary-action-icon" />
                        )}
                        {isEmbeddingNarration ? "Embeddingâ€¦" : "Embed narration in slides"}
                      </Button>
                    </div>
                  </div>
                )}
              <ProgressPanel
                jobIdInput={jobIdInput}
                onJobIdChange={setJobIdInput}
                onStartTracking={handleStartTracking}
                onStopTracking={handleStopTracking}
                connectionStatus={jobTracking.connectionStatus}
                activeJobId={activeJobId}
                latestUpdate={latestProgress}
                history={progressHistory}
                lastError={lastError}
              />
            </>
          ) : (
            <LoadingOverlay
              isLoading={jobState.loading}
              message={jobState.loadingMessage || "Processing..."}
            >
              {currentView === "login" && (
                <LoginView
                  isDevelopment={isDevelopment}
                  onDevelopmentModeChange={setIsDevelopment}
                  onAuthChange={handleLogin}
                />
              )}
              {currentView === "initial" && (
                <InitialView
                  onNavigateToScript={() => setCurrentView("script")}
                  onNavigateToSettings={() => setCurrentView("settings")}
                  onStartNarrationJob={startNarrationJob}
                  onStartQuickNarration={startQuickNarrationForCurrentSlide}
                  onNavigateToProgress={goToProgressView}
                  isStartingJob={isStartingJob}
                  isStartingQuickJob={isStartingQuickJob}
                  progressViewEnabled={PROGRESS_VIEW_ENABLED}
                  activeJobId={activeJobId}
                />
              )}
              {currentView === "script" && (
                <ScriptView
                  includeImages={includeImages}
                  onIncludeImagesChange={setIncludeImages}
                  activeJobId={activeJobId}
                  isRefreshingContext={isRefreshingContext}
                  onRefreshContext={refreshContextFromManifest}
                  progressViewEnabled={PROGRESS_VIEW_ENABLED}
                  onNavigateToSettings={() => setCurrentView("settings")}
                  onNavigateToProgress={goToProgressView}
                  onStartNarrationJob={startNarrationJob}
                  isStartingJob={isStartingJob}
                  slideScripts={slideScripts}
                  jobAudioExports={jobAudioExports}
                  onUpdateSlide={handleSlideUpdate}
                  onPreviewSlide={handlePreviewSlide}
                  onRefineSlide={handleRefineSlide}
                  previewingSlideId={previewingSlideId}
                  refiningSlideId={refiningSlideId}
                  onAddImage={handleAddImageAttachment}
                  onRemoveImage={handleRemoveImageAttachment}
                  onEmbedNarration={embedNarrationIntoPresentation}
                  embeddingNarration={isEmbeddingNarration}
                  jobInProgress={
                    isStartingJob ||
                    isStartingQuickJob ||
                    (activeJobId &&
                      (!latestProgress ||
                        latestProgress.status === "processing" ||
                        latestProgress.status === "queued"))
                  }
                  isStartingQuickJob={isStartingQuickJob}
                />
              )}
              {currentView === "settings" && (
                <SettingsView
                  onNavigateBack={() => setCurrentView("script")}
                  voiceSettings={voiceSettings}
                  onVoiceSettingsChange={setVoiceSettings}
                  onVoicePreview={handleVoicePreview}
                  buildBackendUrl={buildBackendHttpUrl}
                  disabled={disabledVoiceActions}
                  languageOptions={LANGUAGE_OPTIONS}
                />
              )}
              {currentView === "debug" && <DebugPanel />}
              {currentView === "export" && (
                <ExportPanel
                  jobId={activeJobId}
                  job={
                    latestProgress
                      ? {
                          id: activeJobId,
                          status: latestProgress.status,
                          progress: latestProgress.progress,
                          currentSlide: latestProgress.currentSlide,
                          totalSlides: latestProgress.totalSlides,
                          message: latestProgress.message,
                          error: latestProgress.error,
                          createdAt: latestProgress.receivedAt,
                        }
                      : null
                  }
                  onEmbedComplete={() => {
                    setStatusMessage("Audio successfully embedded in PowerPoint!");
                    goToProgressView();
                  }}
                />
              )}
            </LoadingOverlay>
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced component with error boundaries and job state management
export function EnhancedNarrationAssistant() {
  return (
    <ErrorBoundary>
      <OfficeJSErrorBoundary>
        <NetworkErrorBoundary>
          <JobProvider>
            <NarrationAssistant />
          </JobProvider>
        </NetworkErrorBoundary>
      </OfficeJSErrorBoundary>
    </ErrorBoundary>
  );
}


