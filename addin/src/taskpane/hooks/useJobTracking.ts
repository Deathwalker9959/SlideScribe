import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgressSnapshot, ConnectionStatus } from "@components/ProgressPanel";
import { normalizeAudioExports, normalizeTimeline } from "../services/manifestService";

export interface UseJobTrackingOptions {
  historyLimit?: number;
  buildWebSocketUrl: (clientId: string) => string;
  onProgress: (snapshot: ProgressSnapshot) => void;
  onApplyResult?: (payload: any) => void;
  onManifestRefresh?: (jobId: string) => Promise<void>;
  onSetActiveJob?: (jobId: string | null) => void;
  onStatus?: (message: string | null) => void;
  onError?: (message: string | null) => void;
}

export interface UseJobTrackingReturn {
  connectionStatus: ConnectionStatus;
  activeJobId: string | null;
  progressHistory: ProgressSnapshot[];
  latestProgress: ProgressSnapshot | null;
  handleStartTracking: (jobId: string, options?: { preserveState?: boolean }) => void;
  handleStopTracking: () => void;
}

/**
 * Extracted WebSocket job tracking logic with reconnect/backoff.
 */
export function useJobTracking(options: UseJobTrackingOptions): UseJobTrackingReturn {
  const {
    historyLimit = 25,
    buildWebSocketUrl,
    onProgress,
    onApplyResult,
    onManifestRefresh,
    onSetActiveJob,
    onStatus,
    onError,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressSnapshot[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(`progress-client-${Math.random().toString(36).slice(2, 11)}`);
  const trackedJobIdRef = useRef<string | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);

  const appendProgressEvent = useCallback(
    (event: ProgressSnapshot) => {
      setProgressHistory((current) => {
        const next = [event, ...current];
        return next.length > historyLimit ? next.slice(0, historyLimit) : next;
      });
    },
    [historyLimit]
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

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

  const handleStartTracking = useCallback(
    (jobId: string, startOptions?: { preserveState?: boolean }) => {
      const preserveState = Boolean(startOptions?.preserveState);
      const trimmedJobId = jobId.trim();
      if (!trimmedJobId) {
        onError?.("Please enter a job ID to track.");
        return;
      }

      if (!preserveState) {
        onError?.(null);
        setProgressHistory([]);
      } else {
        onError?.(null);
      }

      shouldReconnectRef.current = true;
      trackedJobIdRef.current = trimmedJobId;
      reconnectAttemptRef.current = 0;
      manualCloseRef.current = false;
      clearReconnectTimer();

      const subscribeToJob = (socket: WebSocket, jobIdToSub: string) => {
        socket.send(JSON.stringify({ action: "subscribe", job_id: jobIdToSub }));
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
        onStatus?.(
          preserveState ? "Reconnected to progress service." : "Connected to progress service."
        );
        subscribeToJob(socket, trimmedJobId);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || typeof payload !== "object") {
            onError?.("Received malformed progress payload.");
            return;
          }
          if (payload.event === "connected") return;
          if (payload.event === "subscribed") {
            setActiveJobId(payload.job_id ?? trimmedJobId);
            onSetActiveJob?.(payload.job_id ?? trimmedJobId ?? null);
            onError?.(null);
            return;
          }
          if (payload.event === "unsubscribed") {
            if (!payload.job_id || payload.job_id === activeJobId) {
              setActiveJobId(null);
              onSetActiveJob?.(null);
            }
            return;
          }
          if (payload.event === "error") {
            onError?.(payload.message ?? "WebSocket error");
            return;
          }
          if (!payload.job_id || typeof payload.progress !== "number") {
            onError?.("Received unexpected progress payload.");
            return;
          }

          if (
            payload.result ||
            payload.slide_result ||
            payload.contextual_metadata ||
            payload.audio
          ) {
            onApplyResult?.(payload);
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
            contextualHighlights: payload.contextual_metadata?.highlights,
            contextualCallouts: payload.contextual_metadata?.callouts,
            imageReferences: payload.contextual_metadata?.image_references,
            contextualTransitions: payload.contextual_metadata?.transitions,
            contextConfidence: payload.contextual_metadata?.confidence,
            audioTimeline: normalizeTimeline(payload.audio?.timeline),
            audioExports: payload.audio ? normalizeAudioExports(payload.audio.exports) : undefined,
            audioPeakDb:
              payload.audio?.output_peak_dbfs ?? payload.audio?.transition_output?.output_peak_dbfs,
            audioLoudnessDb:
              payload.audio?.output_loudness_dbfs ??
              payload.audio?.transition_output?.output_loudness_dbfs,
            audioBackgroundTrack: payload.audio?.background_track_path,
          };
          appendProgressEvent(snapshot);
          onProgress(snapshot);

          if (
            (payload.status === "completed" || snapshot.status === "completed") &&
            payload.job_id
          ) {
            void onManifestRefresh?.(payload.job_id);
          }
        } catch (error) {
          console.warn("Failed to parse progress message", error);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error", error);
        setConnectionStatus("error");
        onError?.("Unable to connect to progress service.");
        onStatus?.("Progress connection error. Retrying…");
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
          onStatus?.("Connection lost. Attempting to reconnect…");
          if (!reconnectTimeoutRef.current) {
            const delay = Math.min(30000, Math.pow(2, Math.min(attempt, 6) - 1) * 1000);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (!shouldReconnectRef.current || !trackedJobIdRef.current) return;
              setConnectionStatus("connecting");
              handleStartTracking(trackedJobIdRef.current, { preserveState: true });
            }, delay);
          }
        } else {
          setConnectionStatus("disconnected");
          setActiveJobId(null);
          onSetActiveJob?.(null);
        }
      };
    },
    [
      activeJobId,
      appendProgressEvent,
      buildWebSocketUrl,
      clearReconnectTimer,
      connectionStatus,
      handleSocketClose,
      onApplyResult,
      onError,
      onManifestRefresh,
      onProgress,
      onSetActiveJob,
      onStatus,
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
    onSetActiveJob?.(null);
    setConnectionStatus("disconnected");
    onError?.(null);
    setProgressHistory([]);
    onStatus?.("Disconnected from progress updates.");
  }, [clearReconnectTimer, connectionStatus, onError, onSetActiveJob, onStatus]);

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

  const latestProgress = progressHistory.length > 0 ? progressHistory[0] : null;

  return {
    connectionStatus,
    activeJobId,
    progressHistory,
    latestProgress,
    handleStartTracking,
    handleStopTracking,
  };
}
