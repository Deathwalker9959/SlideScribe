/* eslint-env browser */
/* global globalThis */
/* eslint-disable office-addins/no-context-sync-in-loop */

export interface SlideAudioSource {
  slideId: string;
  slideNumber: number;
  audioUrl?: string | null;
}

export interface PreparedSlideAudio {
  slideId: string;
  slideNumber: number;
  base64: string;
}

export interface PrepareAudioResult {
  prepared: PreparedSlideAudio[];
  failedSlides: number[];
}

export type AudioBase64Fetcher = (audioUrl: string) => Promise<string>;

export async function prepareSlideAudioSources(
  sources: SlideAudioSource[],
  fetcher: AudioBase64Fetcher
): Promise<PrepareAudioResult> {
  const prepared: PreparedSlideAudio[] = [];
  const failedSlides: number[] = [];

  const results = await Promise.all(
    sources.map(async (source) => {
      if (!source.audioUrl) {
        return {
          slideId: source.slideId,
          slideNumber: source.slideNumber,
          base64: null as string | null,
          failed: false,
        };
      }
      try {
        const base64 = await fetcher(source.audioUrl);
        return { slideId: source.slideId, slideNumber: source.slideNumber, base64, failed: false };
      } catch (error) {
        const logger =
          typeof globalThis !== "undefined" && (globalThis as any).console
            ? (globalThis as any).console
            : null;
        if (logger && typeof logger.warn === "function") {
          logger.warn("Failed to fetch audio for slide", source.slideId, error);
        }
        return {
          slideId: source.slideId,
          slideNumber: source.slideNumber,
          base64: null,
          failed: true,
        };
      }
    })
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    if (result.base64) {
      prepared.push({
        slideId: result.slideId,
        slideNumber: result.slideNumber,
        base64: result.base64,
      });
    } else if (result.failed) {
      failedSlides.push(result.slideNumber);
    }
  }

  return {
    prepared,
    failedSlides,
  };
}

type PowerPointRunCallback = (context: any) => Promise<void> | void;

export interface PowerPointLike {
  run(callback: PowerPointRunCallback): Promise<void>;
}

export async function embedPreparedSlideAudio(
  powerPoint: PowerPointLike,
  preparedSlides: PreparedSlideAudio[]
): Promise<void> {
  if (!preparedSlides.length) {
    return;
  }

  await powerPoint.run(async (context: any) => {
    const presentationSlides = context?.presentation?.slides;
    if (!presentationSlides) {
      throw new Error("PowerPoint presentation slides are unavailable.");
    }

    // Load presentation information
    presentationSlides.load("items");
    await context.sync();

    const slides: any[] = Array.isArray(presentationSlides.items) ? presentationSlides.items : [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of preparedSlides) {
      try {
        const slideIndex = Math.min(slides.length - 1, Math.max(0, item.slideNumber - 1));
        if (slideIndex < 0 || slideIndex >= slides.length) {
          console.warn(
            `Slide ${item.slideNumber} not found in presentation (index ${slideIndex} out of range)`
          );
          failedCount++;
          continue;
        }

        const pptSlide = slides[slideIndex];
        const shapes = pptSlide?.shapes;
        if (!shapes) {
          console.warn(`Shapes collection not available for slide ${item.slideNumber}`);
          failedCount++;
          continue;
        }

        // Load existing shapes to check for previous narration
        shapes.load("items/name");
        await context.sync();

        const existingShapes: any[] = Array.isArray(shapes.items) ? shapes.items : [];

        // Remove existing SlideScribe narration shapes
        for (const shape of existingShapes) {
          const shapeName = typeof shape?.name === "string" ? shape.name : "";
          if (shapeName.startsWith("SlideScribeNarration") && typeof shape?.delete === "function") {
            shape.delete();
          }
        }
        await context.sync();

        // Add audio shape with better positioning and settings
        const shapesAny = shapes as any;

        // Position audio icon in bottom-right corner, make it small but visible
        const audioOptions = {
          left: slides[slideIndex].width ? slides[slideIndex].width - 60 : 600, // 60px from right
          top: slides[slideIndex].height ? slides[slideIndex].height - 60 : 400, // 60px from bottom
          width: 50, // Slightly larger for better visibility
          height: 50,
          embed: true,
          displayMode: "icon", // Show audio icon instead of full player
          rewindAfterPlaying: false, // Don't auto-rewind
          playAcrossSlides: false, // Don't play across multiple slides
        };

        let audioShape: any;

        // Try addAudio first (preferred method)
        if (typeof shapesAny.addAudio === "function") {
          audioShape = shapesAny.addAudio(item.base64, audioOptions);
        }
        // Fallback to addMedia if addAudio is not available
        else if (typeof shapesAny.addMedia === "function") {
          audioShape = shapesAny.addMedia(item.base64, "Audio", audioOptions);
        }
        // If neither method is available, throw an error
        else {
          throw new Error(
            "Audio embedding is not supported in this version of PowerPoint. Please ensure you're using PowerPoint for Microsoft 365."
          );
        }

        // Configure the audio shape
        if (audioShape && typeof audioShape === "object") {
          try {
            // Set a unique name for the audio shape
            audioShape.name = `SlideScribeNarration_${item.slideNumber}_${Date.now()}`;

            // Set audio playback options if available
            if (typeof audioShape.audioSettings === "object" && audioShape.audioSettings !== null) {
              audioShape.audioSettings.playOnEntry = true; // Auto-play when slide starts
              audioShape.audioSettings.hideWhileNotPlaying = false; // Keep icon visible
              audioShape.audioSettings.playLooped = false; // Don't loop
            }

            // Load and sync the audio shape settings
            audioShape.load("name");
            await context.sync();

            successCount++;
          } catch (configError) {
            console.warn(
              `Failed to configure audio shape for slide ${item.slideNumber}:`,
              configError
            );
            // Still count as success if the shape was added, even if configuration failed
            successCount++;
          }
        } else {
          console.error(`Failed to create audio shape for slide ${item.slideNumber}`);
          failedCount++;
        }
      } catch (slideError) {
        console.error(`Error processing slide ${item.slideNumber}:`, slideError);
        failedCount++;
      }
    }

    // Final sync to ensure all changes are saved
    await context.sync();
  });
}
