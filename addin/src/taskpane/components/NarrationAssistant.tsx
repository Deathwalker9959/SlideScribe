import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@ui/button';
import { ArrowLeft, Download, Mic, Settings, Bug, Activity, Edit } from 'lucide-react';
import { DebugPanel } from '@components/DebugPanel';
import { ProgressPanel, ProgressSnapshot, ConnectionStatus } from '@components/ProgressPanel';
import { ScriptEditor, SlideScript, RefinementMode } from '@components/ScriptEditor';
import { VoiceSettings, VoiceSettingsValue, DEFAULT_VOICE_SETTINGS } from '@components/VoiceSettings';

type View = 'initial' | 'script' | 'settings' | 'progress' | 'debug';

declare global {
  interface Window {
    __SLIDESCRIBE_BACKEND_URL__?: string;
    __SLIDESCRIBE_PROGRESS_WS__?: string;
  }
}

const HISTORY_LIMIT = 25;
const SCRIPT_STORAGE_KEY = 'slidescribe-script-editor';
const VOICE_SETTINGS_STORAGE_KEY = 'slidescribe-voice-settings';

const calculateMetrics = (text: string) => {
  const trimmed = text.trim();
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  const durationSeconds = wordCount === 0 ? 0 : Math.max(5, Math.round((wordCount / 160) * 60));
  return { wordCount, durationSeconds };
};

const createDefaultSlides = (): SlideScript[] => {
  const slides = [
    {
      slideId: 'slide-1',
      slideNumber: 1,
      originalText: 'Welcome to our product launch presentation where we introduce the vision, goals, and roadmap for the upcoming quarter.',
    },
    {
      slideId: 'slide-2',
      slideNumber: 2,
      originalText: 'Our solution focuses on delivering seamless collaboration features, intuitive workflows, and AI-assisted authoring tools.',
    },
    {
      slideId: 'slide-3',
      slideNumber: 3,
      originalText: 'Next steps include gathering feedback, iterating on the prototype, and preparing the launch campaign assets.',
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
      imageReferences: [],
      contextualTransitions: {},
      contextConfidence: null,
    } satisfies SlideScript;
  });
};

export function NarrationAssistant() {
  const [currentView, setCurrentView] = useState<View>('initial');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsValue>(() => {
    if (typeof window === 'undefined') {
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
      console.warn('Failed to load stored voice settings', error);
      return DEFAULT_VOICE_SETTINGS;
    }
  });
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [jobIdInput, setJobIdInput] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressSnapshot[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [previewingSlideId, setPreviewingSlideId] = useState<string | null>(null);
  const [refiningSlideId, setRefiningSlideId] = useState<string | null>(null);
  const [slideScripts, setSlideScripts] = useState<SlideScript[]>(() => {
    const defaults = createDefaultSlides();
    if (typeof window === 'undefined') {
      return defaults;
    }
    try {
      const raw = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
      if (!raw) {
        return defaults;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return defaults;
      }
      return parsed.map((item, index) => {
        const text = typeof item.refinedScript === 'string' ? item.refinedScript : item.originalText ?? '';
        const { wordCount, durationSeconds } = calculateMetrics(text);
        return {
          slideId: item.slideId ?? `slide-${index + 1}`,
          slideNumber: item.slideNumber ?? index + 1,
          originalText: item.originalText ?? text,
          refinedScript: text,
          wordCount: item.wordCount ?? wordCount,
          duration: item.duration ?? durationSeconds,
          updatedAt: item.updatedAt ?? new Date().toISOString(),
          contextualHighlights: Array.isArray(item.contextualHighlights) ? item.contextualHighlights : [],
          imageReferences: Array.isArray(item.imageReferences) ? item.imageReferences : [],
          contextualTransitions:
            item.contextualTransitions && typeof item.contextualTransitions === 'object'
              ? item.contextualTransitions
              : {},
          contextConfidence:
            typeof item.contextConfidence === 'number' ? item.contextConfidence : null,
          contextualUpdatedAt: item.contextualUpdatedAt,
        } as SlideScript;
      });
    } catch (error) {
      console.warn('Failed to load saved scripts', error);
      return defaults;
    }
  });
  const clientIdRef = useRef<string>(`progress-client-${Math.random().toString(36).slice(2, 11)}`);
  const manifestLoadedJobRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(slideScripts));
    } catch (error) {
      console.warn('Unable to persist script editor state', error);
    }
  }, [slideScripts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(voiceSettings));
    } catch (error) {
      console.warn('Unable to persist voice settings', error);
    }
  }, [voiceSettings]);

  const buildWebSocketUrl = useCallback(
    (clientId: string) => {
      const overrides: (string | undefined)[] = [
        window.__SLIDESCRIBE_PROGRESS_WS__,
        window.__SLIDESCRIBE_BACKEND_URL__,
        `${window.location.origin}`,
        'http://localhost:8000',
      ];

      for (const base of overrides) {
        if (!base) continue;
        try {
          const url = new URL(base, window.location.href);
          const isDirectWs = url.protocol.startsWith('ws');

          if (!isDirectWs) {
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          }

          const normalizedPath = url.pathname.endsWith('/ws/progress')
            ? url.pathname
            : `${url.pathname.replace(/\/$/, '')}/ws/progress`;

          url.pathname = normalizedPath;
          url.searchParams.set('client_id', clientId);
          return url.toString();
        } catch (error) {
          console.warn('Unable to build WebSocket URL from base', base, error);
        }
    }

    const fallbackProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${fallbackProtocol}//${window.location.host}/ws/progress?client_id=${clientId}`;
  },
  []
);

  const buildBackendHttpUrl = useCallback(
    (path: string) => {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const candidates = [
        window.__SLIDESCRIBE_BACKEND_URL__,
        window.location.origin,
        'http://localhost:8000',
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          const url = new URL(candidate, window.location.href);
          url.pathname = `${url.pathname.replace(/\/$/, '')}${normalizedPath}`;
          return url.toString();
        } catch (error) {
          console.warn('Unable to construct backend URL from candidate', candidate, error);
        }
      }

      return `http://localhost:8000${normalizedPath}`;
    },
    []
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

  const refreshContextFromManifest = useCallback(
    async (jobId: string) => {
      if (!jobId || manifestLoadedJobRef.current === jobId) {
        return;
      }

      try {
        const requestUrl = buildBackendHttpUrl(`/api/v1/narration/manifest/${jobId}`);
        const response = await fetch(requestUrl, {
          headers: {
            Authorization: 'Bearer test_token',
          },
        });

        if (!response.ok) {
          throw new Error(`Manifest fetch failed with status ${response.status}`);
        }

        const data = await response.json();
        const slidesData: any[] = Array.isArray(data?.slides) ? data.slides : [];
        const byId = slidesData.reduce<Record<string, any>>((acc, entry) => {
          if (entry?.slide_id) {
            acc[entry.slide_id] = entry;
          }
          return acc;
        }, {});

        setSlideScripts((current) =>
          current.map((slide) => {
            const remote = byId[slide.slideId];
            if (!remote) {
              return slide;
            }

            let refinedScript = slide.refinedScript;
            if (typeof remote.refined_content === 'string' && remote.refined_content.trim().length > 0) {
              refinedScript = remote.refined_content;
            }

            const { wordCount, durationSeconds } = calculateMetrics(refinedScript);
            const meta = remote.contextual_metadata || {};

            return {
              ...slide,
              refinedScript,
              wordCount,
              duration: durationSeconds,
              updatedAt: new Date().toISOString(),
              contextualHighlights: Array.isArray(meta.highlights) ? meta.highlights : slide.contextualHighlights ?? [],
              imageReferences: Array.isArray(meta.image_references) ? meta.image_references : slide.imageReferences ?? [],
              contextualTransitions:
                meta.transitions && typeof meta.transitions === 'object'
                  ? meta.transitions
                  : slide.contextualTransitions ?? {},
              contextConfidence:
                typeof meta.confidence === 'number'
                  ? Math.max(0, Math.min(1, meta.confidence))
                  : slide.contextConfidence ?? null,
              contextualUpdatedAt: new Date().toISOString(),
            } satisfies SlideScript;
          })
        );

        manifestLoadedJobRef.current = jobId;
        setStatusMessage('Contextual insights refreshed from backend manifest.');
        setLastError(null);
      } catch (error) {
        console.warn('Manifest refresh error', error);
        if (manifestLoadedJobRef.current === jobId) {
          manifestLoadedJobRef.current = null;
        }
      }
    },
    [buildBackendHttpUrl]
  );

  const applySlideProcessingResult = useCallback((slideId: string, result: any) => {
    setSlideScripts((current) =>
      current.map((slide) => {
        if (slide.slideId !== slideId) {
          return slide;
        }

        const next: SlideScript = { ...slide };

        if (typeof result?.refined_content === 'string' && result.refined_content.trim().length > 0) {
          const { wordCount, durationSeconds } = calculateMetrics(result.refined_content);
          next.refinedScript = result.refined_content;
          next.wordCount = wordCount;
          next.duration = durationSeconds;
          next.updatedAt = new Date().toISOString();
        }

        const meta = result?.contextual_metadata;
        if (meta) {
          next.contextualHighlights = Array.isArray(meta.highlights) ? meta.highlights : [];
          next.imageReferences = Array.isArray(meta.image_references) ? meta.image_references : [];
          next.contextualTransitions =
            meta.transitions && typeof meta.transitions === 'object' ? meta.transitions : {};
          next.contextConfidence =
            typeof meta.confidence === 'number'
              ? Math.max(0, Math.min(1, meta.confidence))
              : next.contextConfidence ?? null;
          next.contextualUpdatedAt = new Date().toISOString();
        }

        return next;
      })
    );
  }, []);

  const fetchSlideInsights = useCallback(
    async (slide: SlideScript, refinedText?: string) => {
      try {
        const requestUrl = buildBackendHttpUrl('/api/v1/narration/process-slide');
        const payload = {
          presentation_id: 'addin-preview',
          presentation_title: 'Narration Assistant',
          slide_id: slide.slideId,
          slide_number: slide.slideNumber,
          slide_title: `Slide ${slide.slideNumber}`,
          slide_content: refinedText ?? slide.refinedScript ?? slide.originalText,
          slide_notes: null,
          slide_layout: null,
          images: [],
          total_slides: slideScripts.length,
          topic_keywords: [],
        };

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_token',
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
        console.warn('Slide context analysis error', error);
        setStatusMessage('Refinement saved. Contextual insights unavailable.');
      }
    },
    [applySlideProcessingResult, buildBackendHttpUrl, slideScripts.length, setLastError, setStatusMessage]
  );

  const handleSocketClose = useCallback((shouldResetJob: boolean) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionStatus('disconnected');
    if (shouldResetJob) {
      setActiveJobId(null);
      setProgressHistory([]);
    }
  }, []);

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
        const requestUrl = buildBackendHttpUrl('/api/v1/tts/synthesize');
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_token',
          },
          body: JSON.stringify({
            text: slide.refinedScript,
            voice: voiceSettings.voiceName,
            driver: voiceSettings.provider,
            speed: voiceSettings.speed,
            pitch: voiceSettings.pitch,
            output_format: 'mp3',
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
            ? 'Preview generated. Audio available from backend.'
            : 'Preview request completed.'
        );
      } catch (error) {
        console.error('Preview error', error);
        setLastError(error instanceof Error ? error.message : 'Failed to generate preview.');
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
        const requestUrl = buildBackendHttpUrl('/api/v1/ai-refinement/refine');
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_token',
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
        setStatusMessage('Slide refined. Updating contextual insights...');
        await fetchSlideInsights(updatedSlide, refinedText);
      } catch (error) {
        console.error('Refinement error', error);
        setLastError(error instanceof Error ? error.message : 'Failed to refine slide.');
      } finally {
        setRefiningSlideId(null);
      }
    },
    [buildBackendHttpUrl, voiceSettings, handleSlideUpdate, fetchSlideInsights]
  );

  const handleVoicePreview = useCallback(
    async (settings: VoiceSettingsValue) => {
      setStatusMessage('Generating voice preview...');
      setLastError(null);
      try {
        const requestUrl = buildBackendHttpUrl('/api/v1/tts/synthesize');
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_token',
          },
          body: JSON.stringify({
            text: 'This is your selected narration voice in action.',
            voice: settings.voiceName,
            driver: settings.provider,
            speed: settings.speed,
            pitch: settings.pitch,
            volume: settings.volume,
            language: settings.language,
            output_format: 'mp3',
          }),
        });

        if (!response.ok) {
          throw new Error(`Voice preview failed with status ${response.status}`);
        }

        setStatusMessage('Voice preview generated. Check backend media output.');
      } catch (error) {
        console.error('Voice preview error', error);
        setLastError(error instanceof Error ? error.message : 'Failed to preview voice.');
        setStatusMessage(null);
      }
    },
    [buildBackendHttpUrl]
  );

  const handleStartTracking = useCallback((jobIdOverride?: string) => {
    const rawJobId = jobIdOverride ?? jobIdInput;
    const trimmedJobId = rawJobId.trim();
    if (!trimmedJobId) {
      setLastError('Please enter a job ID to track.');
      return;
    }

    if (jobIdOverride && jobIdInput !== trimmedJobId) {
      setJobIdInput(trimmedJobId);
    }

    setLastError(null);
    setProgressHistory([]);
    manifestLoadedJobRef.current = null;

    const subscribeToJob = (socket: WebSocket, jobId: string) => {
      const payload = { action: 'subscribe', job_id: jobId };
      socket.send(JSON.stringify(payload));
    };

    if (socketRef.current && connectionStatus === 'connected') {
      if (activeJobId && activeJobId !== trimmedJobId) {
        socketRef.current.send(JSON.stringify({ action: 'unsubscribe', job_id: activeJobId }));
      }
      subscribeToJob(socketRef.current, trimmedJobId);
      return;
    }

    if (socketRef.current) {
      handleSocketClose(true);
    }

    const clientId = clientIdRef.current;
    const wsUrl = buildWebSocketUrl(clientId);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    setConnectionStatus('connecting');

    socket.onopen = () => {
      setConnectionStatus('connected');
      subscribeToJob(socket, trimmedJobId);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'connected') {
          return;
        }
        if (payload.event === 'subscribed') {
          setActiveJobId(payload.job_id ?? trimmedJobId);
          setLastError(null);
          return;
        }
        if (payload.event === 'unsubscribed') {
          if (!payload.job_id || payload.job_id === activeJobId) {
            setActiveJobId(null);
          }
          return;
        }
        if (payload.event === 'error') {
          setLastError(payload.message ?? 'WebSocket error');
          return;
        }

        if (payload.job_id && typeof payload.progress === 'number') {
          const resultPayload = payload.result ?? payload.slide_result;
          if (resultPayload?.contextual_metadata && (resultPayload.slide_id || payload.slide_id)) {
            const slideIdentifier = resultPayload.slide_id ?? payload.slide_id;
            if (slideIdentifier) {
              applySlideProcessingResult(slideIdentifier, resultPayload);
            }
          }

          const contextualMeta = resultPayload?.contextual_metadata ?? payload.contextual_metadata;
          const snapshot: ProgressSnapshot = {
            jobId: payload.job_id,
            status: payload.status ?? 'unknown',
            currentStep: payload.current_step ?? 'unknown',
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
            imageReferences: Array.isArray(contextualMeta?.image_references)
              ? contextualMeta.image_references
              : undefined,
            contextualTransitions:
              contextualMeta?.transitions && typeof contextualMeta.transitions === 'object'
                ? contextualMeta.transitions
                : undefined,
            contextConfidence:
              typeof contextualMeta?.confidence === 'number'
                ? Math.max(0, Math.min(1, contextualMeta.confidence))
                : undefined,
          };
          appendProgressEvent(snapshot);

          if ((payload.status === 'completed' || snapshot.status === 'completed') && payload.job_id) {
            refreshContextFromManifest(payload.job_id);
          }
        }
      } catch (error) {
        console.warn('Failed to parse progress message', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error', error);
      setConnectionStatus('error');
      setLastError('Unable to connect to progress service.');
    };

    socket.onclose = () => {
      socketRef.current = null;
      setConnectionStatus('disconnected');
      setActiveJobId(null);
    };
  }, [
    jobIdInput,
    connectionStatus,
    activeJobId,
    appendProgressEvent,
    buildWebSocketUrl,
    handleSocketClose,
    applySlideProcessingResult,
    refreshContextFromManifest,
  ]);

  const handleStopTracking = useCallback(() => {
    if (socketRef.current && connectionStatus !== 'disconnected') {
      socketRef.current.close();
      socketRef.current = null;
    }
    setActiveJobId(null);
    setConnectionStatus('disconnected');
    setLastError(null);
    setProgressHistory([]);
    setStatusMessage('Disconnected from progress updates.');
    manifestLoadedJobRef.current = null;
  }, [connectionStatus]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  const startNarrationJob = useCallback(async () => {
    if (isStartingJob) {
      return;
    }

    setIsStartingJob(true);
    setLastError(null);
    setStatusMessage('Starting narration job...');

    try {
      if (slideScripts.length === 0) {
        throw new Error('Add slide scripts before starting narration.');
      }

      const requestUrl = buildBackendHttpUrl('/api/v1/narration/process-presentation');
      const slidesPayload = slideScripts.map((slide) => ({
        slide_id: slide.slideId,
        title: `Slide ${slide.slideNumber}`,
        content: slide.refinedScript || slide.originalText,
        notes: null,
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
          source: 'office-addin',
          requested_at: new Date().toISOString(),
        },
      };

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_token',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`);
      }

      const data = await response.json();
      const newJobId = data.job_id;
      if (!newJobId) {
        throw new Error('Backend response missing job ID');
      }

      setJobIdInput(newJobId);
      setActiveJobId(newJobId);
      setProgressHistory([]);
      manifestLoadedJobRef.current = null;
      setStatusMessage(`Narration job ${newJobId} started.`);
      setCurrentView('progress');
      handleStartTracking(newJobId);
    } catch (error) {
      console.error('Failed to start narration job', error);
      setLastError(error instanceof Error ? error.message : 'Failed to start narration job.');
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
  ]);

  const latestProgress = progressHistory.length > 0 ? progressHistory[0] : null;
  const disabledVoiceActions = isStartingJob || previewingSlideId !== null || refiningSlideId !== null;

  useEffect(() => {
    if (latestProgress?.status === 'completed' && latestProgress.jobId) {
      refreshContextFromManifest(latestProgress.jobId);
    }
  }, [latestProgress, refreshContextFromManifest]);

  const renderInitialView = () => (
    <div className="narration-view narration-view--initial">
      <div className="narration-icon-wrapper">
        <Edit className="narration-icon" />
      </div>
      <h2 className="narration-title">Ready to narrate</h2>
      <p className="narration-description">
        Review each slide’s script, adjust the voice settings, then start the narration job to generate audio and subtitles.
      </p>
      <Button
        onClick={startNarrationJob}
        className="narration-btn-generate"
        disabled={isStartingJob}
      >
        <Download className="narration-btn-icon" />
        {isStartingJob ? 'Starting...' : 'Start Narration'}
      </Button>
    </div>
  );

  const renderScriptView = () => (
    <div className="narration-view narration-view--script">
      <div className="narration-script-toolbar">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentView('settings')}
        >
          <Settings className="narration-btn-icon" />
          Voice Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentView('progress')}
        >
          <Activity className="narration-btn-icon" />
          View Progress
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={startNarrationJob}
          disabled={isStartingJob}
        >
          <Mic className="narration-btn-icon" />
          {isStartingJob ? 'Starting...' : 'Start Narration'}
        </Button>
      </div>
      <ScriptEditor
        slides={slideScripts}
        onUpdateSlide={handleSlideUpdate}
        onPreview={handlePreviewSlide}
        onRefine={handleRefineSlide}
        previewingSlideId={previewingSlideId}
        refiningSlideId={refiningSlideId}
      />
    </div>
  );

  const renderSettingsView = () => (
    <div className="narration-view narration-view--settings">
      <div className="narration-back-header">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCurrentView('script')}
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

  return (
    <div className="narration-assistant">
      <div className="narration-container">
        <div className="narration-header-main">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView(currentView === 'progress' ? 'initial' : 'progress')}
            className="narration-progress-toggle"
            title="View narration progress"
          >
            <Activity className="narration-btn-icon" />
          </Button>
          <h1 className="narration-main-title">Narration Assistant</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView(currentView === 'debug' ? 'initial' : 'debug')}
            className="narration-debug-toggle"
            title="Toggle Debug Panel"
          >
            <Bug className="narration-btn-icon" />
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

        {currentView === 'initial' && renderInitialView()}
        {currentView === 'script' && renderScriptView()}
        {currentView === 'settings' && renderSettingsView()}
        {currentView === 'progress' && (
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
        )}
        {currentView === 'debug' && <DebugPanel />}
      </div>
    </div>
  );
}
