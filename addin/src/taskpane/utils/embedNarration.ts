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

    if (typeof presentationSlides.load === "function") {
      presentationSlides.load("items");
    }
    if (typeof context.sync === "function") {
      await context.sync();
    }

    const slides: any[] = Array.isArray(presentationSlides.items) ? presentationSlides.items : [];

    for (const item of preparedSlides) {
      const slideIndex = Math.min(slides.length - 1, Math.max(0, item.slideNumber - 1));
      if (slideIndex < 0 || slideIndex >= slides.length) {
        continue;
      }

      const pptSlide = slides[slideIndex];
      const shapes = pptSlide?.shapes;
      if (!shapes) {
        continue;
      }

      const existingShapes: any[] = Array.isArray(shapes.items) ? shapes.items : [];
      if (typeof shapes.load === "function") {
        shapes.load("items/name");
      }
      if (typeof context.sync === "function") {
        await context.sync();
      }

      existingShapes.forEach((shape) => {
        const shapeName = typeof shape?.name === "string" ? shape.name : "";
        if (shapeName.startsWith("SlideScribeNarration") && typeof shape?.delete === "function") {
          shape.delete();
        }
      });
      if (typeof context.sync === "function") {
        await context.sync();
      }

      const shapesAny = shapes as any;
      const options = { left: 20, top: 20, width: 40, height: 40, embed: true };
      let audioShape: any;
      if (typeof shapesAny.addAudio === "function") {
        audioShape = shapesAny.addAudio(item.base64, options);
      } else if (typeof shapesAny.addMedia === "function") {
        audioShape = shapesAny.addMedia(item.base64, "Audio", options);
      } else {
        throw new Error("Audio embedding is not supported in this version of PowerPoint.");
      }

      if (audioShape && typeof audioShape === "object") {
        try {
          audioShape.name = `SlideScribeNarration_${item.slideNumber}`;
        } catch {
          // Ignore failures when assigning shape name
        }
      }
    }

    if (typeof context.sync === "function") {
      await context.sync();
    }
  });
}
