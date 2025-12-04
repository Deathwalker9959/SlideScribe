import type { SlideScript } from "../components/ScriptEditor";
import { PowerPointService } from "./powerPointService";

/**
 * Slide processing and refinement service
 */
export class SlideProcessingService {
  /**
   * Apply processing result to a slide
   */
  static applyProcessingResult(slide: SlideScript, result: any): SlideScript {
    const next: SlideScript = { ...slide };
    const sourceContent =
      typeof result?.original_content === "string" && result.original_content.trim().length > 0
        ? result.original_content
        : slide.originalText;

    if (typeof result?.refined_content === "string" && result.refined_content.trim().length > 0) {
      next.refinedScript = result.refined_content;
      next.contentHash = result.content_hash ?? slide.contentHash;
    }

    if (typeof result?.audio_url === "string") {
      next.audioUrl = result.audio_url;
    }

    if (result?.insights) {
      next.insights = result.insights;
    }

    if (result?.metrics) {
      next.durationSeconds = result.metrics.duration_seconds ?? slide.durationSeconds;
      next.wordCount = result.metrics.word_count ?? slide.wordCount;
    }

    if (result?.contextual_metadata) {
      if (Array.isArray(result.contextual_metadata.highlights)) {
        next.insights = next.insights || {};
        next.insights.highlights = result.contextual_metadata.highlights;
      }
      if (Array.isArray(result.contextual_metadata.callouts)) {
        next.insights = next.insights || {};
        next.insights.callouts = result.contextual_metadata.callouts;
      }
    }

    return next;
  }

  /**
   * Process slide for insights
   */
  static async fetchSlideInsights(
    slide: SlideScript,
    buildBackendUrl: (path: string) => string,
    authToken: string = "test_token"
  ): Promise<any> {
    const payload = {
      slide_id: slide.slideId,
      title: slide.originalText?.split(/\r?\n/)[0]?.trim() || `Slide ${slide.slideNumber}`,
      content: slide.refinedScript || slide.originalText,
      notes: null,
      images: [],
    };

    const response = await fetch(buildBackendUrl("/api/v1/narration/process-slide"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slide insights fetch failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Refine slide script with AI
   */
  static async refineSlideScript(
    slide: SlideScript,
    buildBackendUrl: (path: string) => string,
    authToken: string = "test_token"
  ): Promise<any> {
    const payload = {
      slide_id: slide.slideId,
      content: slide.originalText,
      context: {
        slide_number: slide.slideNumber,
        title: slide.originalText?.split(/\r?\n/)[0]?.trim(),
      },
    };

    const response = await fetch(buildBackendUrl("/api/v1/narration/refine-slide"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slide refinement failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Update slide in collection
   */
  static updateSlideInCollection(slides: SlideScript[], updatedSlide: SlideScript): SlideScript[] {
    return slides.map((slide) => (slide.slideId === updatedSlide.slideId ? updatedSlide : slide));
  }

  /**
   * Add image attachment to slide
   */
  static addImageToSlide(
    slide: SlideScript,
    attachment: {
      id: string;
      name: string;
      mimeType: string;
      base64: string;
      size: number;
    }
  ): SlideScript {
    const attachments = slide.imageAttachments ?? [];
    return {
      ...slide,
      imageAttachments: [...attachments, attachment],
    };
  }

  /**
   * Remove image attachment from slide
   */
  static removeImageFromSlide(slide: SlideScript, attachmentId: string): SlideScript {
    return {
      ...slide,
      imageAttachments: (slide.imageAttachments ?? []).filter(
        (attachment) => attachment.id !== attachmentId
      ),
    };
  }
}
