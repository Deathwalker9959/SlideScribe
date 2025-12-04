import type {
  SlideAudioExport,
  SlideAudioTimelineEntry,
  SlideScript,
} from "../components/ScriptEditor";
import { PowerPointService } from "./powerPointService";

export type ManifestCacheEntry = {
  jobId: string;
  manifest: any;
  presentationId?: string;
  updatedAt: string;
};

export type ManifestCache = {
  jobs: Record<string, ManifestCacheEntry>;
  presentations: Record<string, ManifestCacheEntry>;
};

export const parseManifestCache = (raw: string | null): ManifestCache => {
  if (!raw) return { jobs: {}, presentations: {} };
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

export const serializeManifestCache = (cache: ManifestCache): string => JSON.stringify(cache);

export const extractPresentationId = (manifest: any): string | null => {
  if (!manifest || typeof manifest !== "object") return null;
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
  if (!entry || typeof entry !== "object") return null;

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

export const normalizeTimeline = (input: any): SlideAudioTimelineEntry[] => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => normalizeTimelineEntry(item))
      .filter((item): item is SlideAudioTimelineEntry => Boolean(item));
  }
  const single = normalizeTimelineEntry(input);
  return single ? [single] : [];
};

export const normalizeAudioExports = (input: any): SlideAudioExport[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const format = (item.format ?? item.type ?? "").toString();
      if (!format) return null;
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

export const normalizeJobExportsResponse = (input: any): SlideAudioExport[] => {
  if (!Array.isArray(input)) return [];
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

type ApplyManifestParams = {
  slides: SlideScript[];
  manifest: any;
  mapExportsWithResolvedUrl: (exports: SlideAudioExport[] | undefined) => SlideAudioExport[];
};

type ApplyManifestResult = {
  slides: SlideScript[];
  audioExports: SlideAudioExport[];
  presentationId: string | null;
};

export const applyManifestToSlides = ({
  slides,
  manifest,
  mapExportsWithResolvedUrl,
}: ApplyManifestParams): ApplyManifestResult => {
  const slidesData: any[] = Array.isArray(manifest?.slides) ? manifest.slides : [];
  const byId = slidesData.reduce<Record<string, any>>((acc, entry) => {
    if (entry?.slide_id) acc[entry.slide_id] = entry;
    return acc;
  }, {});

  const manifestAudio = manifest?.audio ?? {};
  const manifestExports = mapExportsWithResolvedUrl(normalizeAudioExports(manifestAudio.exports));

  const nextSlides = slides.map((slide) => {
    const remote = byId[slide.slideId];
    if (!remote) return slide;

    const remoteOriginal =
      typeof remote.original_content === "string"
        ? remote.original_content
        : typeof remote.original_text === "string"
          ? remote.original_text
          : "";
    const slideContentHash = PowerPointService.computeContentHash(slide.originalText);
    const remoteContentHash = remoteOriginal
      ? PowerPointService.computeContentHash(remoteOriginal)
      : null;
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
      // keep local script when content diverges
    } else if (!hasTrustedOriginal && remoteHasRefined) {
      // ignore when original missing
    }

    const { wordCount, durationSeconds } = PowerPointService.calculateMetrics(refinedScript);
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
  });

  return {
    slides: nextSlides,
    audioExports: manifestExports,
    presentationId: extractPresentationId(manifest),
  };
};
