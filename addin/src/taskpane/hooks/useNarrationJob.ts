import { useState, useCallback } from "react";
import type { SlideScript } from "../components/ScriptEditor";
import type { VoiceSettingsValue } from "../components/VoiceSettings";
import { NarrationService, type ProcessPresentationPayload } from "../services/narrationService";
import { PowerPointService } from "../services/powerPointService";

const DEFAULT_PRESENTATION_ID = "addin-preview";
const DEFAULT_PRESENTATION_TITLE = "Narration Assistant";

export interface UseNarrationJobReturn {
  isStartingJob: boolean;
  isStartingQuickJob: boolean;
  startNarrationJob: () => Promise<void>;
  startQuickNarrationForCurrentSlide: () => Promise<void>;
}

interface NarrationJobOptions {
  presentationId?: string;
  includeImages?: boolean;
  onJobCreated?: (jobId: string) => void;
  onStatusMessage?: (message: string | null) => void;
  onError?: (error: string) => void;
  onSlidesRefreshed?: (slides: SlideScript[]) => void;
}

/**
 * Custom hook for creating and managing narration jobs
 */
export function useNarrationJob(
  slideScripts: SlideScript[],
  voiceSettings: VoiceSettingsValue,
  narrationService: NarrationService,
  options?: NarrationJobOptions
): UseNarrationJobReturn {
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [isStartingQuickJob, setIsStartingQuickJob] = useState(false);

  const presentationId = options?.presentationId ?? DEFAULT_PRESENTATION_ID;
  const includeImages = options?.includeImages ?? true;

  /**
   * Start a full narration job for all slides
   */
  const startNarrationJob = useCallback(async () => {
    if (isStartingJob) {
      return;
    }

    setIsStartingJob(true);
    options?.onError?.(null as any);
    options?.onStatusMessage?.("Starting narration job...");

    try {
      // Always try to refresh from PowerPoint before sending to backend
      let slidesForJob = slideScripts;
      if (PowerPointService.isAvailable()) {
        try {
          const refreshedSlides = await PowerPointService.extractSlides();
          if (refreshedSlides.length > 0) {
            slidesForJob = refreshedSlides;
            options?.onSlidesRefreshed?.(refreshedSlides);
            options?.onStatusMessage?.(
              `Reloaded ${refreshedSlides.length} slide${refreshedSlides.length === 1 ? "" : "s"} from PowerPoint.`
            );
          }
        } catch (refreshError) {
          console.warn("Slide reload before narration failed", refreshError);
        }
      }

      // Filter out placeholder slides
      const sanitizedSlides = slidesForJob.filter(
        (slide) =>
          slide.originalText.trim() !== "Welcome to our presentation. This is the first slide."
      );

      if (sanitizedSlides.length === 0) {
        if (!PowerPointService.isAvailable()) {
          throw new Error("No slides available. Open this add-in inside PowerPoint and try again.");
        }
        throw new Error("Add slide scripts before starting narration.");
      }

      // Build slides payload
      const slidesPayload = sanitizedSlides.map((slide) => {
        const slideTitle =
          slide.originalText?.split(/\r?\n/)[0]?.trim() || `Slide ${slide.slideNumber}`;
        const currentContentHash = PowerPointService.computeContentHash(slide.originalText);
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

      const payload: ProcessPresentationPayload = {
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

      const { job_id: newJobId } = await narrationService.processPresentation(payload);

      options?.onStatusMessage?.(`Narration job ${newJobId} started.`);
      options?.onJobCreated?.(newJobId);
    } catch (error) {
      console.error("Failed to start narration job", error);
      options?.onError?.(error instanceof Error ? error.message : "Failed to start narration job.");
      options?.onStatusMessage?.(null);
    } finally {
      setIsStartingJob(false);
    }
  }, [
    isStartingJob,
    slideScripts,
    voiceSettings,
    narrationService,
    presentationId,
    includeImages,
    options,
  ]);

  /**
   * Start a quick narration job for the currently selected slide
   */
  const startQuickNarrationForCurrentSlide = useCallback(async () => {
    if (isStartingQuickJob) {
      return;
    }

    setIsStartingQuickJob(true);
    options?.onError?.(null as any);
    options?.onStatusMessage?.("Starting narration for current slide...");

    try {
      let slidesForJob = slideScripts;
      if (PowerPointService.isAvailable()) {
        try {
          const refreshed = await PowerPointService.extractSlides();
          if (refreshed.length > 0) {
            slidesForJob = refreshed;
            options?.onSlidesRefreshed?.(refreshed);
          }
        } catch (refreshError) {
          console.warn("Slide reload before quick narration failed", refreshError);
        }
      }

      const sanitizedSlides = slidesForJob.filter(
        (slide) =>
          slide.originalText.trim() !== "Welcome to our presentation. This is the first slide."
      );

      if (sanitizedSlides.length === 0) {
        if (!PowerPointService.isAvailable()) {
          throw new Error(
            "No slides available. Open this add-in inside PowerPoint and select a slide."
          );
        }
        throw new Error("No slide content available. Make sure a slide is selected.");
      }

      const selectedNumber = await PowerPointService.getSelectedSlideNumber();
      const targetSlide =
        (selectedNumber
          ? sanitizedSlides.find((slide) => slide.slideNumber === selectedNumber)
          : null) ?? sanitizedSlides[0];

      if (!targetSlide || !targetSlide.originalText.trim()) {
        throw new Error("Selected slide has no content.");
      }

      const slideTitle =
        targetSlide.originalText?.split(/\r?\n/)[0]?.trim() || `Slide ${targetSlide.slideNumber}`;
      const slidePayload = {
        slide_id: targetSlide.slideId,
        title: slideTitle,
        content:
          targetSlide.refinedScript && targetSlide.refinedScript.trim().length > 0
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

      const payload: ProcessPresentationPayload = {
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

      const { job_id: newJobId } = await narrationService.processPresentation(payload);

      options?.onStatusMessage?.(`Narration job ${newJobId} started for current slide.`);
      options?.onJobCreated?.(newJobId);
    } catch (error) {
      console.error("Failed to start quick narration", error);
      options?.onError?.(error instanceof Error ? error.message : "Failed to start narration.");
      options?.onStatusMessage?.(null);
    } finally {
      setIsStartingQuickJob(false);
    }
  }, [
    isStartingQuickJob,
    slideScripts,
    voiceSettings,
    narrationService,
    presentationId,
    includeImages,
    options,
  ]);

  return {
    isStartingJob,
    isStartingQuickJob,
    startNarrationJob,
    startQuickNarrationForCurrentSlide,
  };
}
