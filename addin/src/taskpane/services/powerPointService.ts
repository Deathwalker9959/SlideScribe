/* global PowerPoint */

import type { SlideScript } from "../components/ScriptEditor";

const WORDS_PER_MINUTE = 160;

/**
 * PowerPoint service for Office.js operations
 */
export class PowerPointService {
  /**
   * Check if PowerPoint runtime is available
   */
  static isAvailable(): boolean {
    return typeof PowerPoint !== "undefined" && typeof PowerPoint.run === "function";
  }

  /**
   * Extract slides from the current PowerPoint presentation
   */
  static async extractSlides(): Promise<SlideScript[]> {
    if (!PowerPointService.isAvailable()) {
      return [];
    }

    try {
      const slides: SlideScript[] = [];

      await PowerPoint.run(async (context) => {
        const presentationSlides = context.presentation.slides;

        // Load slide collection
        presentationSlides.load("items/title");
        await context.sync();

        const totalSlides = Array.isArray(presentationSlides.items)
          ? presentationSlides.items.length
          : 0;

        for (let i = 0; i < totalSlides; i++) {
          const slide = presentationSlides.items[i];
          slide.load("title");
          await context.sync();

          // Extract text from slide shapes
          const textContent = await PowerPointService.extractSlideText(slide, context);
          const fallbackText = `Slide ${i + 1}: ${slide.title || "Untitled"}`;
          const slideText = textContent || fallbackText;
          const imageAttachments = await PowerPointService.extractSlideImages(slide, context, i + 1);

          const { wordCount, durationSeconds } = PowerPointService.calculateMetrics(slideText);
          const slideData: SlideScript = {
            slideId: `slide-${i + 1}`,
            slideNumber: i + 1,
            originalText: slideText,
            refinedScript: slideText,
            contentHash: PowerPointService.computeContentHash(slideText),
            wordCount,
            duration: durationSeconds,
            updatedAt: new Date().toISOString(),
            contextualHighlights: [],
            contextualCallouts: [],
            imageReferences: [],
            imageAttachments,
            contextualTransitions: {},
            contextConfidence: null,
            audioUrl: null,
          };

          slides.push(slideData);
        }
      });

      return slides;
    } catch (error) {
      console.error("Failed to extract slides from PowerPoint:", error);
      return [];
    }
  }

  /**
   * Extract text from a single slide
   */
  private static async extractSlideText(slide: any, context: any): Promise<string> {
    try {
      // Get all shapes on the slide - load basic properties first
      const shapes = slide.shapes;
      shapes.load("items");
      await context.sync();

      const textParts: string[] = [];

      // Process each shape individually to avoid InvalidArgument errors
      for (const shape of shapes.items) {
        try {
          // Check if shape has textFrame
          shape.load("textFrame");
          await context.sync();

          if (shape.textFrame) {
            shape.textFrame.load("hasText");
            await context.sync();

            if (shape.textFrame.hasText) {
              shape.textFrame.textRange.load("text");
              await context.sync();

              const text = shape.textFrame.textRange.text?.trim?.() || "";
              if (text) {
                textParts.push(text);
              }
            }
          }
        } catch {
          // Shape may not support textFrame - skip it
        }
      }

      return textParts.join("\n").trim();
    } catch (error) {
      console.error("Error extracting text from slide:", error);
      return "";
    }
  }

  /**
   * Extract images (base64) from a slide.
   * Note: Office.js support varies by platform; this uses getBase64Image() when available.
   */
  private static async extractSlideImages(
    slide: any,
    context: any,
    slideNumber: number
  ): Promise<
    Array<{
      id: string;
      name?: string;
      mimeType: string;
      base64: string;
      width?: number;
      height?: number;
      slideNumber: number;
    }>
  > {
    const attachments: Array<{
      id: string;
      name?: string;
      mimeType: string;
      base64: string;
      width?: number;
      height?: number;
      slideNumber: number;
    }> = [];

    try {
      // Use slide-level render; shape-level extraction is not reliable on this host.
      if (typeof (slide as any).getImageAsBase64 === "function") {
        const slideImg = (slide as any).getImageAsBase64({ format: "png" } as any);
        await context.sync();
        const base64 = slideImg?.value as string;
        if (base64 && typeof base64 === "string") {
          attachments.push({
            id: `${slideNumber}-slide`,
            name: `slide-${slideNumber}-render`,
            mimeType: "image/png",
            base64,
            slideNumber,
          });
        }
      }
    } catch (error) {
      console.warn("Error extracting slide images:", error);
    }

    return attachments;
  }

  /**
   * Get the currently selected slide number (1-indexed)
   */
  static async getSelectedSlideNumber(): Promise<number | null> {
    if (!PowerPointService.isAvailable()) {
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
        if (
          typeof selected.start === "number" &&
          typeof selected.count === "number" &&
          selected.count > 0
        ) {
          return selected.start + 1; // PowerPoint uses zero-based start
        }
        return null;
      });
    } catch (error) {
      console.warn("Unable to determine selected slide", error);
      return null;
    }
  }

  /**
   * Calculate word count and estimated duration from text
   */
  static calculateMetrics(text: string): { wordCount: number; durationSeconds: number } {
    const trimmed = text.trim();
    const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
    const durationSeconds =
      wordCount === 0 ? 0 : Math.max(5, Math.round((wordCount / WORDS_PER_MINUTE) * 60));
    return { wordCount, durationSeconds };
  }

  /**
   * Normalize text for content hashing
   */
  static normalizeTextForHash(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }

  /**
   * Compute a simple hash of slide content
   */
  static computeContentHash(text: string): string {
    const normalized = PowerPointService.normalizeTextForHash(text);
    let hash = 5381;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 33) ^ normalized.charCodeAt(i);
    }
    // Use unsigned int to keep output stable across platforms
    return `h${(hash >>> 0).toString(36)}`;
  }
}
