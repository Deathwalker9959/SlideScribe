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
  User,
  LogOut,
  ChevronDown,
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

type View = "login" | "initial" | "script" | "settings" | "progress" | "export" | "debug";

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

// Temporarily disabled â€” debug-oriented progress panel, not suitable for production UI.
const PROGRESS_VIEW_ENABLED = false;

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

const normalizeTextForHash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

const computeContentHash = (text: string) => {
  const normalized = normalizeTextForHash(text);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  // Use unsigned int to keep output stable across platforms
  return `h${(hash >>> 0).toString(36)}`;
};

const extractSlidesFromPowerPoint = async (): Promise<SlideScript[]> => {
  console.log("=== Starting PowerPoint slide extraction ===");

  if (typeof PowerPoint === "undefined") {
    console.warn("PowerPoint object is undefined - no slides available");
    return [];
  }

  if (typeof PowerPoint.run !== "function") {
    console.warn("PowerPoint.run is not a function - no slides available");
    return [];
  }

  try {
    const slides: SlideScript[] = [];

    await PowerPoint.run(async (context) => {
      const presentationSlides = context.presentation.slides;

      // Load slide collection; count is often undefined, rely on items length
      presentationSlides.load("items/title");
      await context.sync();

      const totalSlides = Array.isArray(presentationSlides.items)
        ? presentationSlides.items.length
        : 0;

      console.log(`Found ${totalSlides} slides in presentation`);

      for (let i = 0; i < totalSlides; i++) {
        const slide = presentationSlides.items[i];
        slide.load("title");
        await context.sync();

        console.log(`Processing slide ${i + 1}/${totalSlides}: "${slide.title || "Untitled"}"`);

        // Extract text from slide shapes
        const textContent = await extractSlideText(slide, context);
        const fallbackText = `Slide ${i + 1}: ${slide.title || "Untitled"}`;
        const slideText = textContent || fallbackText;

        const { wordCount, durationSeconds } = calculateMetrics(slideText);
        const slideData: SlideScript = {
          slideId: `slide-${i + 1}`,
          slideNumber: i + 1,
          originalText: slideText,
          refinedScript: slideText,
          contentHash: computeContentHash(slideText),
          wordCount,
          duration: durationSeconds,
          updatedAt: new Date().toISOString(),
          contextualHighlights: [],
          contextualCallouts: [],
          imageReferences: [],
          contextualTransitions: {},
          contextConfidence: null,
          audioUrl: null,
        };

        slides.push(slideData);
        console.log(`Slide ${i + 1} extracted: ${wordCount} words, ${durationSeconds}s duration`);
      }
    });

    console.log(`=== Extraction complete: ${slides.length} slides extracted ===`);

    if (slides.length === 0) {
      console.warn("No slides extracted from PowerPoint");
      return [];
    }

    return slides;
  } catch (error) {
    console.error("Failed to extract slides from PowerPoint:", error);
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    return [];
  }
};

const extractSlideText = async (slide: any, context: any): Promise<string> => {
  try {
    // Get all shapes on the slide
    const shapes = slide.shapes;
    shapes.load(
      "items/type,items/name,items/textFrame/hasText,items/textFrame/textRange/text,items/textFrame"
    );
    await context.sync();

    console.log(`Found ${shapes.items.length} shapes on slide`);

    const textParts: string[] = [];
    let titleText = "";

    // Collect text in a single pass to mirror DebugPanel behavior
    shapes.items.forEach((shape: any, index: number) => {
      const hasText = shape.textFrame?.hasText;
      const text = hasText ? shape.textFrame?.textRange?.text?.trim?.() : "";
      if (!text) {
        return;
      }

      if (!titleText && index === 0) {
        titleText = text;
      }

      textParts.push(text);
      console.log(`Shape ${index + 1}: extracted "${text.substring(0, 80)}"`);
    });

    const joined = textParts.join("\n").trim();
    const preview = joined.length > 120 ? `${joined.substring(0, 120)}...` : joined;
    console.log(`Total extracted text (${joined.length} chars): "${preview}"`);

    return joined;
  } catch (error) {
    console.error("Error extracting text from slide:", error);
    return "";
  }
};

const isPowerPointRuntime = () =>
  typeof PowerPoint !== "undefined" && typeof PowerPoint.run === "function";

const getSelectedSlideNumber = async (): Promise<number | null> => {
  if (!isPowerPointRuntime()) {
    return null;
  }
  try {
    return await PowerPoint.run(async (context) => {
      const selected = context.presentation.getSelectedSlides
        ? context.presentation.getSelectedSlides()
        : null;
      if (!selected) {
        return null;
      }
      selected.load("start,count");
      await context.sync();
      if (typeof selected.start === "number" && typeof selected.count === "number" && selected.count > 0) {
        return selected.start + 1; // PowerPoint uses zero-based start
      }
      return null;
    });
  } catch (error) {
    console.warn("Unable to determine selected slide", error);
    return null;
  }
};

export function NarrationAssistant() {
  // Use the new job state management
  const { state: jobState, dispatch: jobDispatch } = useJobState();
  const { createJob, updateJobStatus, updateJobProgress, setJobError, setLoading } =
    useJobActions();
  const activeJob = useActiveJob();

  const [currentView, setCurrentView] = useState<View>("login");
  const [viewHistory, setViewHistory] = useState<View[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
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
  const [slideScripts, setSlideScripts] = useState<SlideScript[]>(() => {
    // Initialize with empty array, will be populated with actual PowerPoint slides
    return [];
  });

  // Load slides from PowerPoint on component mount
  useEffect(() => {
    const loadSlides = async () => {
      if (!isPowerPointRuntime()) {
        setStatusMessage("Open this add-in inside PowerPoint to extract slides.");
        setSlideScripts([]);
        return;
      }
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

          const remoteOriginal =
            typeof remote.original_content === "string"
              ? remote.original_content
              : typeof remote.original_text === "string"
                ? remote.original_text
                : "";
          const slideContentHash = computeContentHash(slide.originalText);
          const remoteContentHash = remoteOriginal ? computeContentHash(remoteOriginal) : null;
          const originalsMatch = remoteContentHash ? remoteContentHash === slideContentHash : true;

          let refinedScript = slide.refinedScript;
          let contentHash = slide.contentHash ?? slideContentHash;
          const hasTrustedOriginal = Boolean(remoteContentHash);
          const remoteHasRefined =
            typeof remote.refined_content === "string" && remote.refined_content.trim().length > 0;
          if (hasTrustedOriginal && remoteHasRefined && originalsMatch) {
            refinedScript = remote.refined_content;
            contentHash = remoteContentHash ?? slideContentHash;
          } else if (hasTrustedOriginal && remoteContentHash && !originalsMatch) {
            console.log(
              `[applyManifestData] Skipping manifest script for ${slide.slideId} due to content mismatch`
            );
          } else if (!hasTrustedOriginal && remoteHasRefined) {
            console.log(
              `[applyManifestData] Ignoring refined script for ${slide.slideId} because original content is missing in manifest`
            );
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
            contentHash,
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
          console.log("[WebSocket] Progress update", { payload, resultPayload });

          // Apply slide processing results if we have refined content or contextual metadata
          if (resultPayload && (resultPayload.slide_id || payload.slide_id)) {
            const hasRefinedContent = typeof resultPayload.refined_content === "string" && resultPayload.refined_content.trim().length > 0;
            const hasContextualMetadata = Boolean(resultPayload.contextual_metadata);

            console.log("[WebSocket] Content check", { hasRefinedContent, hasContextualMetadata });

            if (hasRefinedContent || hasContextualMetadata) {
              const slideIdentifier = resultPayload.slide_id ?? payload.slide_id;
              console.log("[WebSocket] Applying results", { slideIdentifier });
              if (slideIdentifier) {
                applySlideProcessingResult(slideIdentifier, resultPayload);
              }
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
        setStatusMessage("Progress connection error. Retryingâ€¦");
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
          setStatusMessage("Connection lost. Attempting to reconnectâ€¦");
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
      // Always try to refresh from PowerPoint before sending to backend
      let slidesForJob = slideScripts;
      if (isPowerPointRuntime()) {
        try {
          const refreshedSlides = await extractSlidesFromPowerPoint();
          if (refreshedSlides.length > 0) {
            slidesForJob = refreshedSlides;
            setSlideScripts(refreshedSlides);
            setStatusMessage(
              `Reloaded ${refreshedSlides.length} slide${refreshedSlides.length === 1 ? "" : "s"} from PowerPoint.`
            );
          }
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
    goToProgressView,
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
          const refreshed = await extractSlidesFromPowerPoint();
          if (refreshed.length > 0) {
            slidesForJob = refreshed;
            setSlideScripts(refreshed);
          }
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
    goToProgressView,
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

  // Check authentication status on mount
  useEffect(() => {
    // For now, start in login state
    // In the future, we could check for stored tokens here
    setIsAuthenticated(false);
  }, []);

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

  const navigateToView = useCallback((view: View) => {
    setViewHistory((prev) => [...prev, currentView]);
    setCurrentView(view);
  }, [currentView]);

  const goToProgressView = useCallback(() => {
    if (PROGRESS_VIEW_ENABLED) {
      setCurrentView("progress");
    }
  }, []);

  const navigateBack = useCallback(() => {
    if (viewHistory.length > 0) {
      const previousView = viewHistory[viewHistory.length - 1];
      setViewHistory((prev) => prev.slice(0, -1));
      setCurrentView(previousView);
    } else {
      // Default back behavior: go to initial view if authenticated, otherwise stay
      if (isAuthenticated && currentView !== "initial" && currentView !== "login") {
        setCurrentView("initial");
      }
    }
  }, [viewHistory, currentView, isAuthenticated]);

  const handleAuthChange = useCallback((isAuthenticated: boolean, user?: any, sessionId?: string) => {
    setIsAuthenticated(isAuthenticated);
    setAuthUser(user);
    setSessionId(sessionId || null);
    if (isAuthenticated) {
      setCurrentView("initial");
      setViewHistory([]);
      setStatusMessage("Successfully logged in");
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setCurrentView("login");
      setViewHistory([]);
      setStatusMessage("Logged out");
      // Auto-dismiss logout message after 2 seconds
      setTimeout(() => setStatusMessage(null), 2000);
    }
  }, [setCurrentView, setStatusMessage]);

  const handleLogout = useCallback(() => {
    setShowProfileDropdown(false);
    handleAuthChange(false, null, null);
  }, [handleAuthChange]);

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

  
  const renderLoginView = () => (
    <div className="narration-view narration-view--login">
      <div className="narration-login-header">
        <h1 className="narration-main-title">SlideScribe</h1>
        <p className="narration-login-subtitle">AI-Powered Narration for PowerPoint</p>
      </div>

      <div className="narration-login-content">
        <EnhancedAuthPanel
          onAuthChange={handleAuthChange}
          className=""
          autoStart={true}
        />
      </div>

      <div className="narration-login-footer">
        <div className="narration-login-dev-toggle">
          <label className="narration-toolbar-checkbox">
            <input
              type="checkbox"
              checked={isDevelopment}
              onChange={(event) => setIsDevelopment(event.target.checked)}
            />
            <span>Development Mode</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderInitialView = () => (
    <div className="narration-view narration-view--initial">
      <div className="narration-icon-wrapper">
        <Edit className="narration-icon" />
      </div>
      <h2 className="narration-title">Welcome to SlideScribe</h2>
      <p className="narration-description">
        Create AI-powered narration for your PowerPoint presentations with customizable voices and real-time progress tracking.
      </p>

      <div className="narration-action-buttons">
        <Button
          onClick={() => setCurrentView("script")}
          className="narration-btn-primary"
        >
          <Edit className="narration-btn-icon" />
          Edit Narration Scripts
        </Button>

        <Button
          onClick={() => setCurrentView("settings")}
          variant="secondary"
          className="narration-btn-secondary"
        >
          <Settings className="narration-btn-icon" />
          Voice Settings
        </Button>
      </div>

      <div className="narration-quick-actions">
        <h3 className="narration-subtitle">Quick Actions</h3>
        <Button
          onClick={startNarrationJob}
          className="narration-btn-generate"
          disabled={isStartingJob}
        >
          <Mic className="narration-btn-icon" />
          {isStartingJob ? "Starting..." : "Generate Narration"}
        </Button>
        <Button
          onClick={startQuickNarrationForCurrentSlide}
          className="narration-btn-secondary"
          variant="secondary"
          disabled={isStartingQuickJob}
        >
          <Mic className="narration-btn-icon" />
          {isStartingQuickJob ? "Starting..." : "Generate Current Slide"}
        </Button>

        {PROGRESS_VIEW_ENABLED && activeJobId && (
          <Button
            onClick={goToProgressView}
            variant="ghost"
            className="narration-btn-view-progress"
          >
            <Activity className="narration-btn-icon" />
            View Progress
          </Button>
        )}
      </div>
    </div>
  );

  const renderScriptView = () => (
    <div className="narration-view narration-view--script">
      <div className="narration-script-toolbar">
        <div className="narration-script-toolbar__group">
        <label className="narration-toolbar-checkbox">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(event) => setIncludeImages(event.target.checked)}
          />
          <span>Include images</span>
        </label>
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
          {isRefreshingContext ? "Refreshing..." : "Refresh Context"}
        </Button>
        </div>
        <div className="narration-script-toolbar__group narration-script-toolbar__group--primary">
          <Button variant="ghost" size="sm" onClick={() => setCurrentView("settings")}>
            <Settings className="narration-btn-icon" />
            Voice Settings
          </Button>
          {PROGRESS_VIEW_ENABLED && (
            <Button variant="ghost" size="sm" onClick={goToProgressView}>
              <Activity className="narration-btn-icon" />
              View Progress
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={startNarrationJob} disabled={isStartingJob}>
            <Mic className="narration-btn-icon" />
            {isStartingJob ? "Starting..." : "Start Narration"}
          </Button>
        </div>
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
        jobInProgress={
          isStartingJob ||
          isStartingQuickJob ||
          (activeJobId &&
            (!latestProgress ||
              latestProgress.status === "processing" ||
              latestProgress.status === "queued"))
        }
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
          goToProgressView();
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
    [currentView, voiceSettings, setVoiceSettings, setStatusMessage, goToProgressView]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

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
                {isEmbeddingNarration ? "Embeddingâ€¦" : "Embed audio"}
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
          {/* Left side - back button and language selector */}
          <div className="narration-header-left">
            {isAuthenticated && currentView !== "login" && (
              <>
                {(viewHistory.length > 0 || currentView !== "initial") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateBack}
                    className="narration-back-btn-header"
                    title="Go back"
                    aria-label="Navigate to previous page"
                  >
                    <ArrowLeft className="narration-btn-icon" />
                  </Button>
                )}
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
              </>
            )}
          </div>

          {/* Center - title */}
          <h1 className="narration-main-title">SlideScribe</h1>

          {/* Right side - progress, profile, debug */}
          <div className="narration-header-right">
            {PROGRESS_VIEW_ENABLED && isAuthenticated && activeJobId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToView(currentView === "progress" ? "initial" : "progress")}
                className="narration-progress-toggle"
                title="View narration progress"
                aria-label="Toggle progress view"
                aria-pressed={currentView === "progress"}
              >
                <Activity className="narration-btn-icon" />
              </Button>
            )}
            {isAuthenticated && currentView !== "login" && (
              <div className="narration-profile-dropdown">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="narration-profile-toggle"
                  title="User profile and settings"
                  aria-label="Toggle user profile menu"
                  aria-expanded={showProfileDropdown}
                >
                  <User className="narration-btn-icon" />
                  <ChevronDown className="narration-btn-icon narration-chevron-icon" />
                </Button>
                {showProfileDropdown && (
                  <div className="narration-profile-menu">
                    <div className="narration-profile-menu-header">
                      <User className="narration-profile-icon" />
                      <div className="narration-profile-info">
                        <span className="narration-profile-name">{authUser?.name || "User"}</span>
                        <span className="narration-profile-email">{authUser?.email || "user@example.com"}</span>
                      </div>
                    </div>
                    <div className="narration-profile-menu-divider"></div>
                    <button
                      onClick={handleLogout}
                      className="narration-profile-menu-item narration-profile-menu-item--logout"
                    >
                      <LogOut className="narration-profile-menu-icon" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            )}
            {isDevelopment && isAuthenticated && currentView !== "login" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToView(currentView === "debug" ? "initial" : "debug")}
                className="narration-debug-toggle"
                title="Toggle Debug Panel (Development Mode)"
                aria-label="Toggle debug panel"
                aria-pressed={currentView === "debug"}
              >
                <Bug className="narration-btn-icon" />
              </Button>
            )}
          </div>
        </div>
        {PROGRESS_VIEW_ENABLED && activeJobId && latestProgress && (
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
                connectionStatus={connectionStatus}
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
              {currentView === "login" && renderLoginView()}
              {currentView === "initial" && renderInitialView()}
              {currentView === "script" && renderScriptView()}
              {currentView === "settings" && renderSettingsView()}
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


