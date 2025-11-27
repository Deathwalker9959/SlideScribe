import { useState, useCallback, useRef } from "react";
import type { SlideScript } from "../components/ScriptEditor";

const MANIFEST_STORAGE_KEY = "slidescribe-manifest-cache";

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

export interface UseManifestCacheOptions {
  presentationId?: string;
  buildBackendUrl: (path: string) => string;
  onStatusMessage?: (message: string | null) => void;
  onSlidesUpdate?: (updater: (slides: SlideScript[]) => SlideScript[]) => void;
  onAudioExportsFetch?: (jobId: string) => Promise<void>;
}

export interface UseManifestCacheReturn {
  isRefreshingContext: boolean;
  refreshContextFromManifest: (
    jobId: string,
    options?: { force?: boolean; showStatus?: boolean }
  ) => Promise<void>;
  applyManifestData: (
    jobId: string,
    manifest: any,
    options?: { source?: string; message?: string }
  ) => void;
  loadManifestFromCache: (jobId: string) => ManifestCacheEntry | null;
}

const parseManifestCache = (raw: string | null): ManifestCache => {
  if (!raw) {
    return { jobs: {}, presentations: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      jobs: parsed.jobs ?? {},
      presentations: parsed.presentations ?? {},
    };
  } catch {
    return { jobs: {}, presentations: {} };
  }
};

const serializeManifestCache = (cache: ManifestCache): string => {
  return JSON.stringify(cache);
};

const extractPresentationId = (manifest: any): string | null => {
  return manifest?.metadata?.presentation_id ?? null;
};

/**
 * Custom hook for managing manifest caching and loading
 */
export function useManifestCache(options: UseManifestCacheOptions): UseManifestCacheReturn {
  const [isRefreshingContext, setIsRefreshingContext] = useState(false);
  const manifestLoadedJobRef = useRef<string | null>(null);

  const {
    presentationId,
    buildBackendUrl,
    onStatusMessage,
    onSlidesUpdate,
    onAudioExportsFetch,
  } = options;

  /**
   * Load manifest from localStorage cache
   */
  const loadManifestFromCache = useCallback((jobId: string): ManifestCacheEntry | null => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const cache = parseManifestCache(window.localStorage.getItem(MANIFEST_STORAGE_KEY));
      return cache.jobs[jobId] ?? null;
    } catch (error) {
      console.warn("Failed to load manifest from cache", error);
      return null;
    }
  }, []);

  /**
   * Apply manifest data to slides
   */
  const applyManifestData = useCallback(
    (jobId: string, manifest: any, options?: { source?: string; message?: string }) => {
      console.log("[applyManifestData] Applying manifest", {
        jobId,
        source: options?.source,
        slideCount: manifest?.slides?.length,
      });

      if (!Array.isArray(manifest?.slides)) {
        console.warn("[applyManifestData] No slides array in manifest");
        return;
      }

      onSlidesUpdate?.((current) =>
        current.map((slide) => {
          const manifestSlide = manifest.slides.find((m: any) => m.slide_id === slide.slideId);
          if (!manifestSlide) {
            return slide;
          }

          const next: SlideScript = { ...slide };

          // Apply refined content if available
          if (
            typeof manifestSlide.refined_content === "string" &&
            manifestSlide.refined_content.trim().length > 0
          ) {
            next.refinedScript = manifestSlide.refined_content;
            next.contentHash = manifestSlide.content_hash ?? slide.contentHash;
          }

          // Apply audio URL if available
          if (typeof manifestSlide.audio_url === "string") {
            next.audioUrl = manifestSlide.audio_url;
          }

          // Apply insights
          if (manifestSlide.insights) {
            next.insights = manifestSlide.insights;
          }

          // Apply metrics
          if (manifestSlide.metrics) {
            next.durationSeconds = manifestSlide.metrics.duration_seconds ?? slide.durationSeconds;
            next.wordCount = manifestSlide.metrics.word_count ?? slide.wordCount;
          }

          return next;
        })
      );

      manifestLoadedJobRef.current = jobId;

      if (options?.message) {
        onStatusMessage?.(options.message);
      }
    },
    [onSlidesUpdate, onStatusMessage]
  );

  /**
   * Refresh manifest from backend and cache it
   */
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
        onStatusMessage?.("Refreshing contextual insights from backend...");
      }

      try {
        const requestUrl = buildBackendUrl(`/api/v1/narration/manifest/${jobId}`);
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

        // Cache the manifest
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

        // Fetch audio exports after manifest is loaded
        if (onAudioExportsFetch) {
          await onAudioExportsFetch(jobId);
        }
      } catch (error) {
        console.warn("Manifest refresh error", error);
        if (showStatus) {
          onStatusMessage?.("Unable to refresh contextual insights.");
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
    [applyManifestData, buildBackendUrl, onAudioExportsFetch, presentationId, onStatusMessage]
  );

  return {
    isRefreshingContext,
    refreshContextFromManifest,
    applyManifestData,
    loadManifestFromCache,
  };
}
