import { useState, useCallback, useEffect } from "react";

export type View = "login" | "initial" | "script" | "settings" | "progress" | "export" | "debug";

export interface UseNavigationReturn {
  currentView: View;
  viewHistory: View[];
  navigateToView: (view: View) => void;
  navigateBack: () => void;
  goToProgressView: () => void;
  setCurrentView: (view: View) => void;
  setViewHistory: (history: View[] | ((prev: View[]) => View[])) => void;
}

const LANGUAGE_OPTIONS = [
  { code: "en-US", name: "English (US)" },
  { code: "el-GR", name: "Greek (Greece)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "fr-FR", name: "French (France)" },
  { code: "de-DE", name: "German (Germany)" },
  { code: "it-IT", name: "Italian (Italy)" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "zh-CN", name: "Chinese (China)" },
  { code: "ja-JP", name: "Japanese (Japan)" },
];

const PROGRESS_VIEW_ENABLED = false;

interface NavigationOptions {
  progressViewEnabled?: boolean;
  onStatusMessage?: (message: string | null) => void;
  onVoiceLanguageChange?: (language: string) => void;
  voiceLanguage?: string;
}

/**
 * Custom hook for view navigation and keyboard shortcuts
 */
export function useNavigation(
  initialView: View = "login",
  options?: NavigationOptions
): UseNavigationReturn {
  const [currentView, setCurrentView] = useState<View>(initialView);
  const [viewHistory, setViewHistory] = useState<View[]>([]);

  const progressViewEnabled = options?.progressViewEnabled ?? PROGRESS_VIEW_ENABLED;

  /**
   * Navigate to a view and add current view to history
   */
  const navigateToView = useCallback(
    (view: View) => {
      setViewHistory((prev) => [...prev, currentView]);
      setCurrentView(view);
    },
    [currentView]
  );

  /**
   * Navigate to progress view if enabled
   */
  const goToProgressView = useCallback(() => {
    if (progressViewEnabled) {
      setCurrentView("progress");
    }
  }, [progressViewEnabled]);

  /**
   * Navigate back to previous view
   */
  const navigateBack = useCallback(() => {
    if (viewHistory.length > 0) {
      const previousView = viewHistory[viewHistory.length - 1];
      setViewHistory((prev) => prev.slice(0, -1));
      setCurrentView(previousView);
    } else {
      // Default back behavior: go to initial view if not there
      if (currentView !== "initial" && currentView !== "login") {
        setCurrentView("initial");
      }
    }
  }, [viewHistory, currentView]);

  /**
   * Keyboard navigation handler
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle keyboard shortcuts when not in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case "1":
          event.preventDefault();
          setCurrentView("initial");
          break;
        case "2":
          event.preventDefault();
          setCurrentView("script");
          break;
        case "3":
          event.preventDefault();
          setCurrentView("settings");
          break;
        case "4":
          event.preventDefault();
          goToProgressView();
          break;
        case "5":
          event.preventDefault();
          setCurrentView("debug");
          break;
        case "6":
          event.preventDefault();
          setCurrentView("export");
          break;
        case "l":
        case "L":
          event.preventDefault();
          // Cycle through languages
          if (options?.voiceLanguage && options?.onVoiceLanguageChange) {
            const nextLangIndex =
              (LANGUAGE_OPTIONS.findIndex((lang) => lang.code === options.voiceLanguage) + 1) %
              LANGUAGE_OPTIONS.length;
            const nextLang = LANGUAGE_OPTIONS[nextLangIndex];
            options.onVoiceLanguageChange(nextLang.code);
            options.onStatusMessage?.(`Language changed to ${nextLang.name}`);
          }
          break;
        case "?":
          event.preventDefault();
          setCurrentView(currentView === "debug" ? "initial" : "debug");
          break;
      }
    },
    [currentView, goToProgressView, options]
  );

  // Set up keyboard shortcuts
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    currentView,
    viewHistory,
    navigateToView,
    navigateBack,
    goToProgressView,
    setCurrentView,
    setViewHistory,
  };
}
