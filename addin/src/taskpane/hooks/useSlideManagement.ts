import { useState, useEffect, useCallback } from "react";
import type { SlideScript } from "../components/ScriptEditor";
import { PowerPointService } from "../services/powerPointService";

const SCRIPT_STORAGE_KEY = "slidescribe-script-editor";

export interface UseSlideManagementReturn {
  slideScripts: SlideScript[];
  setSlideScripts: React.Dispatch<React.SetStateAction<SlideScript[]>>;
  refreshSlides: () => Promise<SlideScript[]>;
  updateSlide: (slide: SlideScript) => void;
  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;
}

/**
 * Custom hook for slide management and PowerPoint operations
 */
export function useSlideManagement(): UseSlideManagementReturn {
  const [slideScripts, setSlideScripts] = useState<SlideScript[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  /**
   * Load slides from PowerPoint on component mount
   */
  useEffect(() => {
    const loadSlides = async () => {
      if (!PowerPointService.isAvailable()) {
        setStatusMessage("Open this add-in inside PowerPoint to extract slides.");
        setSlideScripts([]);
        return;
      }
      try {
        setStatusMessage("Extracting slides from PowerPoint...");
        const slides = await PowerPointService.extractSlides();
        setSlideScripts(slides);
        setStatusMessage(
          `Loaded ${slides.length} slide${slides.length === 1 ? "" : "s"} from PowerPoint.`
        );
      } catch (error) {
        console.error("Failed to load slides:", error);
        setStatusMessage("Failed to extract slides from PowerPoint.");
      }
    };

    loadSlides();
  }, []); // Run once on mount

  /**
   * Persist slide scripts to localStorage whenever they change
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(slideScripts));
    } catch (error) {
      console.warn("Unable to persist script editor state", error);
    }
  }, [slideScripts]);

  /**
   * Refresh slides from PowerPoint
   */
  const refreshSlides = useCallback(async (): Promise<SlideScript[]> => {
    if (!PowerPointService.isAvailable()) {
      console.warn("PowerPoint not available for refresh");
      return slideScripts;
    }

    try {
      setStatusMessage("Refreshing slides from PowerPoint...");
      const slides = await PowerPointService.extractSlides();

      if (slides.length > 0) {
        setSlideScripts(slides);
        setStatusMessage(
          `Reloaded ${slides.length} slide${slides.length === 1 ? "" : "s"} from PowerPoint.`
        );
        return slides;
      }

      return slideScripts;
    } catch (error) {
      console.error("Failed to refresh slides:", error);
      setStatusMessage("Failed to refresh slides from PowerPoint.");
      return slideScripts;
    }
  }, [slideScripts]);

  /**
   * Update a single slide
   */
  const updateSlide = useCallback((updated: SlideScript) => {
    setSlideScripts((current) =>
      current.map((slide) => (slide.slideId === updated.slideId ? updated : slide))
    );
    setStatusMessage(`Saved edits for slide ${updated.slideNumber}.`);
  }, []);

  return {
    slideScripts,
    setSlideScripts,
    refreshSlides,
    updateSlide,
    statusMessage,
    setStatusMessage,
  };
}
