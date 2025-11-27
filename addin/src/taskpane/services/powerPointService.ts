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
    console.log("=== Starting PowerPoint slide extraction ===");

    if (!PowerPointService.isAvailable()) {
      console.warn("PowerPoint object is unavailable - no slides available");
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

        console.log(`Found ${totalSlides} slides in presentation`);

        for (let i = 0; i < totalSlides; i++) {
          const slide = presentationSlides.items[i];
          slide.load("title");
          await context.sync();

          console.log(`Processing slide ${i + 1}/${totalSlides}: "${slide.title || "Untitled"}"`);

          // Extract text from slide shapes
          const textContent = await PowerPointService.extractSlideText(slide, context);
          const fallbackText = `Slide ${i + 1}: ${slide.title || "Untitled"}`;
          const slideText = textContent || fallbackText;

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
  }

  /**
   * Extract text from a single slide
   */
  private static async extractSlideText(slide: any, context: any): Promise<string> {
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

      // Collect text in a single pass
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
