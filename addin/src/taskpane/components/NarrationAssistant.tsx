/* global PowerPoint */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@ui/button";
import {
  ArrowLeft,
  Download,
  Mic,
  Settings,
  Bug,
  Activity,
  Edit,
  RefreshCw,
  Loader2,
  Music,
  CheckCircle,
  X,
  Globe,
} from "lucide-react";
import { DebugPanel } from "@components/DebugPanel";
import { ProgressPanel, ProgressSnapshot, ConnectionStatus } from "@components/ProgressPanel";
import {
  ScriptEditor,
  SlideScript,
  RefinementMode,
  SlideAudioTimelineEntry,
  SlideAudioExport,
} from "@components/ScriptEditor";
import {
  VoiceSettings,
  VoiceSettingsValue,
  DEFAULT_VOICE_SETTINGS,
} from "@components/VoiceSettings";
import { ExportPanel } from "@components/ExportPanel";
import { embedPreparedSlideAudio, prepareSlideAudioSources } from "@utils/embedNarration";
import { JobProvider, useJobState, useActiveJob, useJobActions } from "../state/jobManager";
import { ErrorBoundary, OfficeJSErrorBoundary, NetworkErrorBoundary } from "@ui/error-boundary";
import { LoadingSpinner, LoadingOverlay, ProgressIndicator, StatusBadge } from "@ui/loading";
import { AuthPanel, DevAuthPanel } from "@components/AuthPanel";
import { EnhancedAuthPanel } from "@components/EnhancedAuthPanel";

type View = "initial" | "script" | "settings" | "progress" | "debug" | "export";

declare global {
  interface Window {
    __SLIDESCRIBE_BACKEND_URL__?: string;
    __SLIDESCRIBE_PROGRESS_WS__?: string;
  }
}

const HISTORY_LIMIT = 25;
const SCRIPT_STORAGE_KEY = "slidescribe-script-editor";
const VOICE_SETTINGS_STORAGE_KEY = "slidescribe-voice-settings";
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

type ManifestCacheEntry = {
  jobId: string;
  manifest: any;
  presentationId?: string;
  updatedAt: string;
};

type ManifestCache = {
  jobs: Record<string, ManifestCacheEntry>;
  presentations: Record<string, ManifestCacheEntry>;
};

type CompletionToastState = {
  jobId: string;
  message: string;
  visible: boolean;
  createdAt: string;
};

const parseManifestCache = (raw: string | null): ManifestCache => {
  if (!raw) {
    return { jobs: {}, presentations: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const jobs: Record<string, ManifestCacheEntry> = {};
      const presentations: Record<string, ManifestCacheEntry> = {};

      if (parsed.jobs && typeof parsed.jobs === "object") {
        for (const [jobId, value] of Object.entries(parsed.jobs as Record<string, any>)) {
          if (value && typeof value === "object") {
            jobs[jobId] = {
              jobId: typeof value.jobId === "string" ? value.jobId : jobId,
              manifest: value.manifest ?? value,
              presentationId:
                typeof value.presentationId === "string" ? value.presentationId : undefined,
              updatedAt:
                typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
            };
          }
        }
      }

      if (parsed.presentations && typeof parsed.presentations === "object") {
        for (const [presentationId, value] of Object.entries(
          parsed.presentations as Record<string, any>
        )) {
          if (value && typeof value === "object") {
            presentations[presentationId] = {
              jobId:
                typeof value.jobId === "string"
                  ? value.jobId
                  : (value?.manifest?.job_id ?? value?.jobId ?? ""),
              manifest: value.manifest ?? value,
              presentationId:
                typeof value.presentationId === "string" ? value.presentationId : presentationId,
              updatedAt:
                typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
            };
          }
        }
      }

      // Backward compatibility: original shape was { [jobId]: manifest }
      if (Object.keys(jobs).length === 0 && Object.keys(presentations).length === 0) {
        for (const [jobId, manifest] of Object.entries(parsed as Record<string, any>)) {
          jobs[jobId] = {
            jobId,
            manifest,
            presentationId:
              typeof manifest?.presentation_id === "string" ? manifest.presentation_id : undefined,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      return { jobs, presentations };
    }
  } catch (error) {
    console.warn("Failed to parse manifest cache", error);
  }
  return { jobs: {}, presentations: {} };
};

const serializeManifestCache = (cache: ManifestCache): string => JSON.stringify(cache);

const extractPresentationId = (manifest: any): string | null => {
  if (!manifest || typeof manifest !== "object") {
    return null;
  }
  if (typeof manifest.presentation_id === "string" && manifest.presentation_id.trim().length > 0) {
    return manifest.presentation_id;
  }
  if (manifest.presentation && typeof manifest.presentation === "object") {
    const id = manifest.presentation.id ?? manifest.presentation.presentation_id;
    if (typeof id === "string" && id.trim().length > 0) {
      return id;
    }
  }
  if (manifest.metadata && typeof manifest.metadata === "object") {
    const id = manifest.metadata.presentation_id;
    if (typeof id === "string" && id.trim().length > 0) {
      return id;
    }
  }
  return null;
};

const normalizeTimelineEntry = (entry: any): SlideAudioTimelineEntry | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const start = Number(entry.start ?? entry.begin ?? 0);
  const durationValue =
    entry.duration !== undefined ? Number(entry.duration) : Number(entry.end ?? 0) - start;
  const duration = Number.isFinite(durationValue) ? Math.max(0, durationValue) : 0;
  const endValue = entry.end !== undefined ? Number(entry.end) : start + duration;
  const end = Number.isFinite(endValue) ? endValue : start + duration;

  const slideId = entry.slide_id ?? entry.slideId ?? "";
  return {
    slideId: typeof slideId === "string" ? slideId : String(slideId ?? ""),
    start: Number.isFinite(start) ? start : 0,
    end,
    duration,
    sourcePath: entry.source_path ?? entry.sourcePath ?? undefined,
    volume: typeof entry.volume === "number" ? entry.volume : undefined,
    backgroundTrackPath: entry.background_track_path ?? entry.backgroundTrackPath ?? undefined,
  };
};

const normalizeTimeline = (input: any): SlideAudioTimelineEntry[] => {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => normalizeTimelineEntry(item))
      .filter((item): item is SlideAudioTimelineEntry => Boolean(item));
  }
  const single = normalizeTimelineEntry(input);
  return single ? [single] : [];
};

const normalizeAudioExports = (input: any): SlideAudioExport[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const format = (item.format ?? item.type ?? "").toString();
      if (!format) {
        return null;
      }
      return {
        format,
        path: item.path ?? item.output_path ?? "",
        fileSize: typeof item.file_size === "number" ? item.file_size : undefined,
        createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
        downloadUrl:
          typeof item.download_url === "string"
            ? item.download_url
            : typeof item.downloadUrl === "string"
              ? item.downloadUrl
              : undefined,
      } satisfies SlideAudioExport;
    })
    .filter((item): item is SlideAudioExport => Boolean(item));
};

const normalizeJobExportsResponse = (input: any): SlideAudioExport[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return normalizeAudioExports(
    input.map((item) =>
      typeof item === "object" && item
        ? {
            ...item,
            path: item.export_path ?? item.path ?? "",
            download_url: item.download_url ?? item.downloadUrl,
          }
        : item
    )
  );
};

const calculateMetrics = (text: string) => {
  const trimmed = text.trim();
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  const durationSeconds = wordCount === 0 ? 0 : Math.max(5, Math.round((wordCount / 160) * 60));
  return { wordCount, durationSeconds };
};

const extractSlidesFromPowerPoint = async (): Promise<SlideScript[]> => {
  if (typeof PowerPoint === "undefined" || typeof PowerPoint.run !== "function") {
    return createDefaultSlides();
  }

  try {
    const slides: SlideScript[] = [];

    await PowerPoint.run(async (context) => {
      const presentation = context.presentation;
      const presentationSlides = presentation.slides;

      // Load slide titles and text content
      presentationSlides.load("items/title");
      presentationSlides.load("count");
      await context.sync();

      for (let i = 0; i < presentationSlides.count; i++) {
        const slide = presentationSlides.getItemAt(i);
        slide.load("title");
        await context.sync();

        // Extract text from slide shapes
        const textContent = await extractSlideText(slide, context);

        const { wordCount, durationSeconds } = calculateMetrics(textContent);
        slides.push({
          slideId: `slide-${i + 1}`,
          slideNumber: i + 1,
          originalText: textContent || `Slide ${i + 1}: ${slide.title || "Untitled"}`,
          refinedScript: textContent || `Slide ${i + 1}: ${slide.title || "Untitled"}`,
          wordCount,
          duration: durationSeconds,
          updatedAt: new Date().toISOString(),
          contextualHighlights: [],
          contextualCallouts: [],
          imageReferences: [],
          contextualTransitions: {},
          contextConfidence: null,
          audioUrl: null,
        });
      }
    });

    return slides.length > 0 ? slides : createDefaultSlides();
  } catch (error) {
    console.warn("Failed to extract slides from PowerPoint, using defaults:", error);
    return createDefaultSlides();
  }
};

const extractSlideText = async (slide: any, context: any): Promise<string> => {
  try {
    // Get all shapes on the slide
    const shapes = slide.shapes;
    shapes.load("items");
    await context.sync();

    let slideText = "";

    for (let i = 0; i < shapes.items.length; i++) {
      const shape = shapes.items[i];
      shape.load("type", "hasTextFrame", "textFrame");
      await context.sync();

      if (shape.hasTextFrame && shape.textFrame) {
        const textFrame = shape.textFrame;
        textFrame.load("textRange");
        await context.sync();

        if (textFrame.textRange) {
          const textRange = textFrame.textRange;
          textRange.load("text");
          await context.sync();

          if (textRange.text) {
            slideText += textRange.text + " ";
          }
        }
      }
    }

    return slideText.trim();
  } catch (error) {
    console.warn("Error extracting text from slide:", error);
    return "";
  }
};

const createDefaultSlides = (): SlideScript[] => {
  const slides = [
    {
      slideId: "slide-1",
      slideNumber: 1,
      originalText: "Welcome to our presentation. This is the first slide.",
    },
  ];

  return slides.map(({ slideId, slideNumber, originalText }) => {
    const { wordCount, durationSeconds } = calculateMetrics(originalText);
    return {
      slideId,
      slideNumber,
      originalText,
      refinedScript: originalText,
      wordCount,
      duration: durationSeconds,
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
      audioUrl: null,
      audioDuration: null,
    } satisfies SlideScript;
  });
};

export function NarrationAssistant() {
  // Use the new job state management
  const { state: jobState, dispatch: jobDispatch } = useJobState();
  const { createJob, updateJobStatus, updateJobProgress, setJobError, setLoading } =
    useJobActions();
  const activeJob = useActiveJob();

  const [currentView, setCurrentView] = useState<View>("initial");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsValue>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_VOICE_SETTINGS;
    }
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return DEFAULT_VOICE_SETTINGS;
      }
      const parsed = JSON.parse(raw);
      return {
        provider: parsed.provider ?? DEFAULT_VOICE_SETTINGS.provider,
        voiceName: parsed.voiceName ?? DEFAULT_VOICE_SETTINGS.voiceName,
        speed: parsed.speed ?? DEFAULT_VOICE_SETTINGS.speed,
        pitch: parsed.pitch ?? DEFAULT_VOICE_SETTINGS.pitch,
        volume: parsed.volume ?? DEFAULT_VOICE_SETTINGS.volume,
        tone: parsed.tone ?? DEFAULT_VOICE_SETTINGS.tone,
        language: parsed.language ?? DEFAULT_VOICE_SETTINGS.language,
      } satisfies VoiceSettingsValue;
    } catch (error) {
      console.warn("Failed to load stored voice settings", error);
      return DEFAULT_VOICE_SETTINGS;
    }
  });
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  // Initialize authentication and development mode
  useEffect(() => {
    // Check if we're in development mode
    if (typeof window !== "undefined") {
      const hostname = window.location?.hostname || "";
      setIsDevelopment(
        hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("dev")
      );
    }
  }, []);
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);
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
  const [slideScripts, setSlideScripts] = useState<SlideScript[]>(() => {
    // Initialize with empty array, will be populated with actual PowerPoint slides
    return [];
  });

  // Load slides from PowerPoint on component mount
  useEffect(() => {
    const loadSlides = async () => {
      try {
        setStatusMessage("Extracting slides from PowerPoint...");
        const slides = await extractSlidesFromPowerPoint();
        setSlideScripts(slides);
        setStatusMessage(
          `Loaded ${slides.length} slide${slides.length === 1 ? "" : "s"} from PowerPoint.`
        );
      } catch (error) {
        console.error("Failed to load slides:", error);
        setStatusMessage("Failed to extract slides from PowerPoint.");
      }
    };

    loadSlides();
  }, []); // Run once on mount
  const clientIdRef = useRef<string>(`progress-client-${Math.random().toString(36).slice(2, 11)}`);
  const manifestLoadedJobRef = useRef<string | null>(null);
  const completionToastJobRef = useRef<string | null>(null);
  const completionToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedJobIdRef = useRef<string | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);
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
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(slideScripts));
    } catch (error) {
      console.warn("Unable to persist script editor state", error);
    }
  }, [slideScripts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(voiceSettings));
    } catch (error) {
      console.warn("Unable to persist voice settings", error);
    }
  }, [voiceSettings]);

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
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

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

    setIsEmbeddingNarration(true);
    setStatusMessage("Embedding narration audio into slides...");

    try {
      const { prepared, failedSlides } = await prepareSlideAudioSources(
        slideScripts.map((slide) => ({
          slideId: slide.slideId,
          slideNumber: slide.slideNumber,
          audioUrl: slide.audioUrl ?? undefined,
        })),
        async (audioUrl: string) => {
          const base64 = await fetchAudioAsBase64(audioUrl);
          return base64;
        }
      );

      if (prepared.length === 0) {
        setStatusMessage("No slide audio available to embed.");
        setIsEmbeddingNarration(false);
        return;
      }

      await embedPreparedSlideAudio(PowerPoint as any, prepared);

      const uniqueFailed = Array.from(new Set(failedSlides)).sort((a, b) => a - b);
      if (uniqueFailed.length > 0) {
        setStatusMessage(
          `Narration embedded for ${prepared.length} slide${prepared.length === 1 ? "" : "s"}. Slides without audio: ${uniqueFailed.join(
            ", "
          )}.`
        );
      } else {
        setStatusMessage("Narration audio embedded into slides.");
      }
      setLastError(null);
    } catch (error) {
      console.error("Failed to embed narration audio", error);
      setLastError(error instanceof Error ? error.message : "Failed to embed narration audio.");
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
    setCurrentView("progress");
    dismissCompletionToast();
  }, [dismissCompletionToast]);

  const handleEmbedFromToast = useCallback(() => {
    setCurrentView("progress");
    dismissCompletionToast();
    if (isEmbeddingNarration) {
      return;
    }
    void embedNarrationIntoPresentation();
  }, [dismissCompletionToast, embedNarrationIntoPresentation, isEmbeddingNarration]);

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

  const appendProgressEvent = useCallback((event: ProgressSnapshot) => {
    setProgressHistory((current) => {
      const next = [event, ...current];
      if (next.length > HISTORY_LIMIT) {
        return next.slice(0, HISTORY_LIMIT);
      }
      return next;
    });
  }, []);

  const applyManifestData = useCallback(
    (
      jobId: string,
      data: any,
      options?: { source?: "backend" | "cache"; message?: string; skipStatus?: boolean }
    ) => {
      const slidesData: any[] = Array.isArray(data?.slides) ? data.slides : [];
      const byId = slidesData.reduce<Record<string, any>>((acc, entry) => {
        if (entry?.slide_id) {
          acc[entry.slide_id] = entry;
        }
        return acc;
      }, {});

      const manifestAudio = data?.audio ?? {};
      const manifestExports = mapExportsWithResolvedUrl(
        normalizeAudioExports(manifestAudio.exports)
      );
      setJobAudioExports(manifestExports);

      setSlideScripts((current) =>
        current.map((slide) => {
          const remote = byId[slide.slideId];
          if (!remote) {
            return slide;
          }

          let refinedScript = slide.refinedScript;
          if (
            typeof remote.refined_content === "string" &&
            remote.refined_content.trim().length > 0
          ) {
            refinedScript = remote.refined_content;
          }

          const { wordCount, durationSeconds } = calculateMetrics(refinedScript);
          const meta = remote.contextual_metadata || {};

          const callouts = Array.isArray(meta.callouts) ? meta.callouts : [];
          const contextualHighlights = Array.isArray(meta.highlights)
            ? meta.highlights
            : (slide.contextualHighlights ?? []);

          const slideAudioMeta = remote.audio_metadata || {};
          const timelineSource =
            slideAudioMeta.timeline ??
            (Array.isArray(manifestAudio.timeline)
              ? manifestAudio.timeline.find((entry: any) => entry?.slide_id === slide.slideId)
              : undefined);
          const audioTimeline = normalizeTimeline(timelineSource);
          const audioResult = remote.audio_result ?? {};
          const audioUrl = audioResult.audio_url ?? remote.audio_url ?? slide.audioUrl ?? null;
          const audioDuration =
            typeof audioResult.duration === "number"
              ? audioResult.duration
              : typeof slide.audioDuration === "number"
                ? slide.audioDuration
                : null;
          const slideExports = mapExportsWithResolvedUrl(
            normalizeAudioExports(slideAudioMeta.exports ?? manifestAudio.exports)
          );
          const audioMixPath =
            slideAudioMeta.output_path ??
            manifestAudio.output_path ??
            manifestAudio.transition_output?.output_path ??
            slide.audioMixPath ??
            null;
          const audioPeakDb =
            typeof slideAudioMeta.output_peak_dbfs === "number"
              ? slideAudioMeta.output_peak_dbfs
              : typeof manifestAudio.output_peak_dbfs === "number"
                ? manifestAudio.output_peak_dbfs
                : typeof manifestAudio.transition_output?.output_peak_dbfs === "number"
                  ? manifestAudio.transition_output.output_peak_dbfs
                  : (slide.audioPeakDb ?? null);
          const audioLoudnessDb =
            typeof slideAudioMeta.output_loudness_dbfs === "number"
              ? slideAudioMeta.output_loudness_dbfs
              : typeof manifestAudio.output_loudness_dbfs === "number"
                ? manifestAudio.output_loudness_dbfs
                : typeof manifestAudio.transition_output?.output_loudness_dbfs === "number"
                  ? manifestAudio.transition_output.output_loudness_dbfs
                  : (slide.audioLoudnessDb ?? null);
          const audioBackgroundTrack =
            slideAudioMeta.background_track_path ??
            manifestAudio.background_track_path ??
            slide.audioBackgroundTrack ??
            null;

          return {
            ...slide,
            refinedScript,
            wordCount,
            duration: durationSeconds,
            updatedAt: new Date().toISOString(),
            contextualHighlights,
            contextualCallouts: callouts,
            imageReferences: Array.isArray(meta.image_references)
              ? meta.image_references
              : (slide.imageReferences ?? []),
            contextualTransitions:
              meta.transitions && typeof meta.transitions === "object"
                ? meta.transitions
                : (slide.contextualTransitions ?? {}),
            contextConfidence:
              typeof meta.confidence === "number"
                ? Math.max(0, Math.min(1, meta.confidence))
                : (slide.contextConfidence ?? null),
            contextualUpdatedAt: new Date().toISOString(),
            audioTimeline: audioTimeline.length > 0 ? audioTimeline : (slide.audioTimeline ?? []),
            audioExports: slideExports.length > 0 ? slideExports : (slide.audioExports ?? []),
            audioMixPath,
            audioPeakDb,
            audioLoudnessDb,
            audioBackgroundTrack,
            audioUrl,
            audioDuration,
          } satisfies SlideScript;
        })
      );

      manifestLoadedJobRef.current = jobId;
      const manifestPresentationId = extractPresentationId(data);
      if (manifestPresentationId) {
        updatePresentationId(manifestPresentationId);
      }

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
      setSlideScripts((current) =>
        current.map((slide) => {
          if (slide.slideId !== slideId) {
            return slide;
          }

          const next: SlideScript = { ...slide };

          if (
            typeof result?.refined_content === "string" &&
            result.refined_content.trim().length > 0
          ) {
            const { wordCount, durationSeconds } = calculateMetrics(result.refined_content);
            next.refinedScript = result.refined_content;
            next.wordCount = wordCount;
            next.duration = durationSeconds;
            next.updatedAt = new Date().toISOString();
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

  const handleSocketClose = useCallback(
    (shouldResetJob: boolean, options?: { suppressReconnect?: boolean }) => {
      if (socketRef.current) {
        manualCloseRef.current = true;
        socketRef.current.close();
        socketRef.current = null;
      }
      if (options?.suppressReconnect) {
        shouldReconnectRef.current = false;
        trackedJobIdRef.current = null;
      }
      clearReconnectTimer();
      setConnectionStatus("disconnected");
      if (shouldResetJob) {
        setActiveJobId(null);
        setProgressHistory([]);
      }
    },
    [clearReconnectTimer]
  );

  const handleSlideUpdate = useCallback((updated: SlideScript) => {
    setSlideScripts((current) =>
      current.map((slide) => (slide.slideId === updated.slideId ? updated : slide))
    );
    setStatusMessage(`Saved edits for slide ${updated.slideNumber}.`);
    setLastError(null);
  }, []);

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

  const handleVoicePreview = useCallback(
    async (settings: VoiceSettingsValue) => {
      setStatusMessage("Generating voice preview...");
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
            text: "This is your selected narration voice in action.",
            voice: settings.voiceName,
            driver: settings.provider,
            speed: settings.speed,
            pitch: settings.pitch,
            volume: settings.volume,
            language: settings.language,
            output_format: "mp3",
          }),
        });

        if (!response.ok) {
          throw new Error(`Voice preview failed with status ${response.status}`);
        }

        setStatusMessage("Voice preview generated. Check backend media output.");
      } catch (error) {
        console.error("Voice preview error", error);
        setLastError(error instanceof Error ? error.message : "Failed to preview voice.");
        setStatusMessage(null);
      }
    },
    [buildBackendHttpUrl]
  );

  const handleStartTracking = useCallback(
    (jobIdOverride?: string, options?: { preserveState?: boolean }) => {
      const preserveState = Boolean(options?.preserveState);
      const rawJobId = jobIdOverride ?? jobIdInput;
      const trimmedJobId = rawJobId.trim();
      if (!trimmedJobId) {
        setLastError("Please enter a job ID to track.");
        return;
      }

      if (jobIdOverride && jobIdInput !== trimmedJobId) {
        setJobIdInput(trimmedJobId);
      }

      if (!preserveState) {
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

      shouldReconnectRef.current = true;
      trackedJobIdRef.current = trimmedJobId;
      reconnectAttemptRef.current = 0;
      manualCloseRef.current = false;
      clearReconnectTimer();

      const subscribeToJob = (socket: WebSocket, jobId: string) => {
        socket.send(JSON.stringify({ action: "subscribe", job_id: jobId }));
      };

      if (socketRef.current && connectionStatus === "connected") {
        if (activeJobId && activeJobId !== trimmedJobId) {
          socketRef.current.send(JSON.stringify({ action: "unsubscribe", job_id: activeJobId }));
        }
        subscribeToJob(socketRef.current, trimmedJobId);
        return;
      }

      if (socketRef.current) {
        handleSocketClose(!preserveState);
      }

      const clientId = clientIdRef.current;
      const wsUrl = buildWebSocketUrl(clientId);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      setConnectionStatus(preserveState ? "reconnecting" : "connecting");

      socket.onopen = () => {
        manualCloseRef.current = false;
        clearReconnectTimer();
        reconnectAttemptRef.current = 0;
        setConnectionStatus("connected");
        setStatusMessage(
          preserveState ? "Reconnected to progress service." : "Connected to progress service."
        );
        subscribeToJob(socket, trimmedJobId);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || typeof payload !== "object") {
            setLastError("Received malformed progress payload.");
            return;
          }
          if (payload.event === "connected") {
            return;
          }
          if (payload.event === "subscribed") {
            setActiveJobId(payload.job_id ?? trimmedJobId);
            setLastError(null);
            return;
          }
          if (payload.event === "unsubscribed") {
            if (!payload.job_id || payload.job_id === activeJobId) {
              setActiveJobId(null);
            }
            return;
          }
          if (payload.event === "error") {
            setLastError(payload.message ?? "WebSocket error");
            return;
          }

          if (!payload.job_id || typeof payload.progress !== "number") {
            setLastError("Received unexpected progress payload.");
            return;
          }

          const resultPayload = payload.result ?? payload.slide_result;
          if (resultPayload?.contextual_metadata && (resultPayload.slide_id || payload.slide_id)) {
            const slideIdentifier = resultPayload.slide_id ?? payload.slide_id;
            if (slideIdentifier) {
              applySlideProcessingResult(slideIdentifier, resultPayload);
            }
          }

          const contextualMeta = resultPayload?.contextual_metadata ?? payload.contextual_metadata;
          const audioPayload =
            resultPayload?.audio_metadata ?? resultPayload?.audio ?? payload.audio;
          const timelineEntries = normalizeTimeline(audioPayload?.timeline);
          const exportEntries = mapExportsWithResolvedUrl(
            normalizeAudioExports(audioPayload?.exports)
          );
          if (exportEntries.length > 0) {
            setJobAudioExports(exportEntries);
          }

          const snapshot: ProgressSnapshot = {
            jobId: payload.job_id,
            status: payload.status ?? "unknown",
            currentStep: payload.current_step ?? "unknown",
            currentSlide: payload.current_slide ?? 0,
            totalSlides: payload.total_slides ?? 0,
            progress: payload.progress ?? 0,
            estimatedTimeRemaining: payload.estimated_time_remaining ?? 0,
            message: payload.message ?? null,
            error: payload.error ?? null,
            receivedAt: new Date().toISOString(),
            contextualHighlights: Array.isArray(contextualMeta?.highlights)
              ? contextualMeta.highlights
              : undefined,
            contextualCallouts: Array.isArray(contextualMeta?.callouts)
              ? contextualMeta.callouts
              : undefined,
            imageReferences: Array.isArray(contextualMeta?.image_references)
              ? contextualMeta.image_references
              : undefined,
            contextualTransitions:
              contextualMeta?.transitions && typeof contextualMeta.transitions === "object"
                ? contextualMeta.transitions
                : undefined,
            contextConfidence:
              typeof contextualMeta?.confidence === "number"
                ? Math.max(0, Math.min(1, contextualMeta.confidence))
                : undefined,
            audioTimeline: timelineEntries.length > 0 ? timelineEntries : undefined,
            audioExports: exportEntries.length > 0 ? exportEntries : undefined,
            audioPeakDb:
              typeof audioPayload?.output_peak_dbfs === "number"
                ? audioPayload.output_peak_dbfs
                : typeof audioPayload?.transition_output?.output_peak_dbfs === "number"
                  ? audioPayload.transition_output.output_peak_dbfs
                  : undefined,
            audioLoudnessDb:
              typeof audioPayload?.output_loudness_dbfs === "number"
                ? audioPayload.output_loudness_dbfs
                : typeof audioPayload?.transition_output?.output_loudness_dbfs === "number"
                  ? audioPayload.transition_output.output_loudness_dbfs
                  : undefined,
            audioBackgroundTrack: audioPayload?.background_track_path ?? undefined,
          };
          appendProgressEvent(snapshot);

          if (
            (payload.status === "completed" || snapshot.status === "completed") &&
            payload.job_id
          ) {
            refreshContextFromManifest(payload.job_id);
          }
        } catch (error) {
          console.warn("Failed to parse progress message", error);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error", error);
        setConnectionStatus("error");
        setLastError("Unable to connect to progress service.");
        setStatusMessage("Progress connection error. Retrying…");
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (manualCloseRef.current) {
          manualCloseRef.current = false;
          setConnectionStatus("disconnected");
          return;
        }
        if (shouldReconnectRef.current && trackedJobIdRef.current) {
          const attempt = reconnectAttemptRef.current + 1;
          reconnectAttemptRef.current = attempt;
          setConnectionStatus("reconnecting");
          setStatusMessage("Connection lost. Attempting to reconnect…");
          if (!reconnectTimeoutRef.current) {
            const delay = Math.min(30000, Math.pow(2, Math.min(attempt, 6) - 1) * 1000);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (!shouldReconnectRef.current || !trackedJobIdRef.current) {
                return;
              }
              setConnectionStatus("connecting");
              handleStartTracking(trackedJobIdRef.current, { preserveState: true });
            }, delay);
          }
        } else {
          setConnectionStatus("disconnected");
          setActiveJobId(null);
        }
      };
    },
    [
      jobIdInput,
      connectionStatus,
      activeJobId,
      appendProgressEvent,
      buildWebSocketUrl,
      handleSocketClose,
      applySlideProcessingResult,
      refreshContextFromManifest,
      mapExportsWithResolvedUrl,
      setJobAudioExports,
      clearReconnectTimer,
    ]
  );

  const handleStopTracking = useCallback(() => {
    shouldReconnectRef.current = false;
    trackedJobIdRef.current = null;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    if (socketRef.current && connectionStatus !== "disconnected") {
      manualCloseRef.current = true;
      socketRef.current.close();
      socketRef.current = null;
    }
    setActiveJobId(null);
    setConnectionStatus("disconnected");
    setLastError(null);
    setProgressHistory([]);
    setStatusMessage("Disconnected from progress updates.");
    setJobAudioExports([]);
    setShowCompletionSummary(false);
    manifestLoadedJobRef.current = null;
  }, [connectionStatus, setJobAudioExports, clearReconnectTimer]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        manualCloseRef.current = true;
        socketRef.current.close();
        socketRef.current = null;
      }
      shouldReconnectRef.current = false;
      trackedJobIdRef.current = null;
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  const startNarrationJob = useCallback(async () => {
    if (isStartingJob) {
      return;
    }

    setIsStartingJob(true);
    setLastError(null);
    setStatusMessage("Starting narration job...");

    try {
      if (slideScripts.length === 0) {
        throw new Error("Add slide scripts before starting narration.");
      }

      const requestUrl = buildBackendHttpUrl("/api/v1/narration/process-presentation");
      const slidesPayload = slideScripts.map((slide) => ({
        slide_id: slide.slideId,
        title: `Slide ${slide.slideNumber}`,
        content: slide.refinedScript || slide.originalText,
        notes: null,
        images: includeImages
          ? (slide.imageAttachments ?? []).map((attachment) => ({
              image_id: attachment.id,
              description: attachment.name,
              mime_type: attachment.mimeType,
              content_base64: attachment.base64,
            }))
          : [],
      }));

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
      setCurrentView("progress");
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

  const renderInitialView = () => (
    <div className="narration-view narration-view--initial">
      <div className="narration-icon-wrapper">
        <Edit className="narration-icon" />
      </div>
      <h2 className="narration-title">Ready to narrate</h2>
      <p className="narration-description">
        Review each slide’s script, adjust the voice settings, then start the narration job to
        generate audio and subtitles.
      </p>
      <Button
        onClick={startNarrationJob}
        className="narration-btn-generate"
        disabled={isStartingJob}
      >
        <Download className="narration-btn-icon" />
        {isStartingJob ? "Starting..." : "Start Narration"}
      </Button>
    </div>
  );

  const renderScriptView = () => (
    <div className="narration-view narration-view--script">
      <div className="narration-script-toolbar">
        <label className="narration-toolbar-checkbox">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(event) => setIncludeImages(event.target.checked)}
          />
          <span>Include images</span>
        </label>
        <Button variant="ghost" size="sm" onClick={() => setCurrentView("settings")}>
          <Settings className="narration-btn-icon" />
          Voice Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            activeJobId &&
            refreshContextFromManifest(activeJobId, { force: true, showStatus: true })
          }
          disabled={!activeJobId || isRefreshingContext}
        >
          {isRefreshingContext ? (
            <Loader2 className="narration-btn-icon narration-btn-icon--spin" />
          ) : (
            <RefreshCw className="narration-btn-icon" />
          )}
          {isRefreshingContext ? "Refreshing…" : "Refresh Context"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCurrentView("progress")}>
          <Activity className="narration-btn-icon" />
          View Progress
        </Button>
        <Button variant="ghost" size="sm" onClick={startNarrationJob} disabled={isStartingJob}>
          <Mic className="narration-btn-icon" />
          {isStartingJob ? "Starting..." : "Start Narration"}
        </Button>
      </div>
      <ScriptEditor
        slides={slideScripts}
        audioExports={jobAudioExports}
        onUpdateSlide={handleSlideUpdate}
        onPreview={handlePreviewSlide}
        onRefine={handleRefineSlide}
        previewingSlideId={previewingSlideId}
        refiningSlideId={refiningSlideId}
        onAddImage={handleAddImageAttachment}
        onRemoveImage={handleRemoveImageAttachment}
        onEmbedNarration={embedNarrationIntoPresentation}
        embeddingNarration={isEmbeddingNarration}
      />
    </div>
  );

  const renderSettingsView = () => (
    <div className="narration-view narration-view--settings">
      <div className="narration-back-header">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCurrentView("script")}
          className="narration-back-btn"
        >
          <ArrowLeft className="narration-btn-icon" />
        </Button>
        <span className="narration-back-text">Go Back</span>
      </div>
      <VoiceSettings
        value={voiceSettings}
        onChange={setVoiceSettings}
        onPreview={handleVoicePreview}
        buildBackendUrl={buildBackendHttpUrl}
        disabled={disabledVoiceActions}
      />
    </div>
  );

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle keyboard shortcuts when not in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case "1":
          event.preventDefault();
          setCurrentView("initial");
          break;
        case "2":
          event.preventDefault();
          setCurrentView("script");
          break;
        case "3":
          event.preventDefault();
          setCurrentView("settings");
          break;
        case "4":
          event.preventDefault();
          setCurrentView("progress");
          break;
        case "5":
          event.preventDefault();
          setCurrentView("debug");
          break;
        case "6":
          event.preventDefault();
          setCurrentView("export");
          break;
        case "l":
        case "L":
          event.preventDefault();
          // Cycle through languages
          const nextLangIndex =
            (LANGUAGE_OPTIONS.findIndex((lang) => lang.code === voiceSettings.language) + 1) %
            LANGUAGE_OPTIONS.length;
          const nextLang = LANGUAGE_OPTIONS[nextLangIndex];
          setVoiceSettings({ ...voiceSettings, language: nextLang.code });
          setStatusMessage(`Language changed to ${nextLang.name}`);
          break;
        case "?":
          event.preventDefault();
          setCurrentView(currentView === "debug" ? "initial" : "debug");
          break;
      }
    },
    [currentView, voiceSettings, setVoiceSettings, setStatusMessage]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Enhanced authentication change handler
  const handleAuthChange = (authenticated: boolean, user?: any, newSessionId?: string) => {
    setIsAuthenticated(authenticated);
    setAuthUser(user || null);
    setSessionId(newSessionId || null);
  };

  // Authentication check - show login if not authenticated
  if (!isAuthenticated) {
    return (
      <div
        className="narration-assistant narration-assistant--auth"
        role="main"
        aria-label="SlideScribe Authentication"
      >
        <EnhancedAuthPanel
          onAuthChange={handleAuthChange}
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
        {completionToast?.visible && (
          <div className="narration-toast" role="status" aria-live="polite">
            <div className="narration-toast__icon">
              <CheckCircle className="narration-toast__icon-graphic" />
            </div>
            <div className="narration-toast__body">
              <span className="narration-toast__title">Narration ready</span>
              <span className="narration-toast__message">{completionToast.message}</span>
            </div>
            <div className="narration-toast__actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewSummaryFromToast}
                className="narration-toast__action"
              >
                <Activity className="narration-toast__action-icon" />
                View summary
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEmbedFromToast}
                disabled={isEmbeddingNarration}
                className="narration-toast__action"
              >
                {isEmbeddingNarration ? (
                  <Loader2 className="narration-toast__action-icon narration-btn-icon--spin" />
                ) : (
                  <Music className="narration-toast__action-icon" />
                )}
                {isEmbeddingNarration ? "Embedding…" : "Embed audio"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissCompletionToast}
              className="narration-toast__dismiss"
              aria-label="Dismiss narration notification"
            >
              <X className="narration-toast__dismiss-icon" />
            </Button>
          </div>
        )}
        <div className="narration-header-main">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView(currentView === "progress" ? "initial" : "progress")}
            className="narration-progress-toggle"
            title="View narration progress"
            aria-label="Toggle progress view"
            aria-pressed={currentView === "progress"}
          >
            <Activity className="narration-btn-icon" />
          </Button>
          <h1 className="narration-main-title">Narration Assistant</h1>
          <div className="narration-language-selector">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const nextLangIndex =
                  (LANGUAGE_OPTIONS.findIndex((lang) => lang.code === voiceSettings.language) + 1) %
                  LANGUAGE_OPTIONS.length;
                const nextLang = LANGUAGE_OPTIONS[nextLangIndex];
                setVoiceSettings({ ...voiceSettings, language: nextLang.code });
                setStatusMessage(`Language changed to ${nextLang.name}`);
              }}
              className="narration-language-toggle"
              title="Change narration language"
              aria-label={`Current language: ${voiceSettings.language}. Click to change language.`}
            >
              <Globe className="narration-btn-icon" />
              <span className="narration-language-code">{voiceSettings.language}</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView(currentView === "debug" ? "initial" : "debug")}
            className="narration-debug-toggle"
            title="Toggle Debug Panel"
            aria-label="Toggle debug panel"
            aria-pressed={currentView === "debug"}
          >
            <Bug className="narration-btn-icon" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView(currentView === "export" ? "initial" : "export")}
            className="narration-export-toggle"
            title="Export Narration"
            aria-label="Toggle export panel"
            aria-pressed={currentView === "export"}
          >
            <Download className="narration-btn-icon" />
          </Button>
        </div>
        {activeJobId && latestProgress && (
          <div className="narration-job-summary">
            <div className="narration-job-summary__row">
              <span className="narration-job-summary__label">Tracking job</span>
              <span className="narration-job-summary__value">{activeJobId}</span>
            </div>
            <div className="narration-job-summary__stats">
              <span>Status: {latestProgress.status}</span>
              <span>
                Slide {latestProgress.currentSlide}/{latestProgress.totalSlides}
              </span>
              <span>{Math.round((latestProgress.progress ?? 0) * 100)}%</span>
            </div>
          </div>
        )}
        {lastError && (
          <div className="narration-job-alert" role="alert">
            {lastError}
          </div>
        )}
        {statusMessage && !lastError && (
          <div className="narration-job-info" role="status">
            {statusMessage}
          </div>
        )}

        <LoadingOverlay
          isLoading={jobState.loading}
          message={jobState.loadingMessage || "Processing..."}
        >
          <div id="narration-content" tabIndex={-1}>
            {currentView === "initial" && renderInitialView()}
            {currentView === "script" && renderScriptView()}
            {currentView === "settings" && renderSettingsView()}
            {currentView === "progress" && (
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
                                <span className="narration-summary-meta">Preparing…</span>
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
                          {isEmbeddingNarration ? "Embedding…" : "Embed narration in slides"}
                        </Button>
                      </div>
                    </div>
                  )}
                <ProgressPanel
                  jobIdInput={jobIdInput}
                  onJobIdChange={setJobIdInput}
                  onStartTracking={handleStartTracking}
                  onStopTracking={handleStopTracking}
                  connectionStatus={connectionStatus}
                  activeJobId={activeJobId}
                  latestUpdate={latestProgress}
                  history={progressHistory}
                  lastError={lastError}
                />
              </>
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
                  setCurrentView("progress");
                }}
              />
            )}
          </div>
        </LoadingOverlay>
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
