import { useState, useEffect, useCallback } from "react";
import type { VoiceSettingsValue } from "../components/VoiceSettings";
import { DEFAULT_VOICE_SETTINGS } from "../components/VoiceSettings";
import type { NarrationService } from "../services/narrationService";

const VOICE_SETTINGS_STORAGE_KEY = "slidescribe-voice-settings";

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

export interface UseVoiceSettingsReturn {
  voiceSettings: VoiceSettingsValue;
  setVoiceSettings: React.Dispatch<React.SetStateAction<VoiceSettingsValue>>;
  handleVoicePreview: (settings: VoiceSettingsValue) => Promise<void>;
  changeLanguage: (languageCode: string) => void;
  cycleLanguage: () => void;
}

/**
 * Custom hook for voice settings management and persistence
 */
export function useVoiceSettings(
  narrationService: NarrationService,
  onStatusMessage?: (message: string | null) => void,
  onError?: (error: string) => void
): UseVoiceSettingsReturn {
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsValue>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_VOICE_SETTINGS;
    }
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return DEFAULT_VOICE_SETTINGS;
      }
      const parsed = JSON.parse(raw);
      return {
        provider: parsed.provider ?? DEFAULT_VOICE_SETTINGS.provider,
        voiceName: parsed.voiceName ?? DEFAULT_VOICE_SETTINGS.voiceName,
        speed: parsed.speed ?? DEFAULT_VOICE_SETTINGS.speed,
        pitch: parsed.pitch ?? DEFAULT_VOICE_SETTINGS.pitch,
        volume: parsed.volume ?? DEFAULT_VOICE_SETTINGS.volume,
        tone: parsed.tone ?? DEFAULT_VOICE_SETTINGS.tone,
        language: parsed.language ?? DEFAULT_VOICE_SETTINGS.language,
      } satisfies VoiceSettingsValue;
    } catch (error) {
      console.warn("Failed to load stored voice settings", error);
      return DEFAULT_VOICE_SETTINGS;
    }
  });

  /**
   * Persist voice settings to localStorage whenever they change
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(voiceSettings));
    } catch (error) {
      console.warn("Unable to persist voice settings", error);
    }
  }, [voiceSettings]);

  /**
   * Generate a voice preview
   */
  const handleVoicePreview = useCallback(
    async (settings: VoiceSettingsValue) => {
      onStatusMessage?.("Generating voice preview...");
      try {
        await narrationService.synthesizeTTS({
          text: "This is your selected narration voice in action.",
          voice: settings.voiceName,
          driver: settings.provider,
          speed: settings.speed,
          pitch: settings.pitch,
          volume: settings.volume,
          language: settings.language,
          output_format: "mp3",
        });

        onStatusMessage?.("Voice preview generated. Check backend media output.");
      } catch (error) {
        console.error("Voice preview error", error);
        onError?.(error instanceof Error ? error.message : "Failed to preview voice.");
        onStatusMessage?.(null);
      }
    },
    [narrationService, onStatusMessage, onError]
  );

  /**
   * Change language setting
   */
  const changeLanguage = useCallback(
    (languageCode: string) => {
      setVoiceSettings((prev) => ({ ...prev, language: languageCode }));
      const lang = LANGUAGE_OPTIONS.find((l) => l.code === languageCode);
      if (lang) {
        onStatusMessage?.(`Language changed to ${lang.name}`);
      }
    },
    [onStatusMessage]
  );

  /**
   * Cycle to next language
   */
  const cycleLanguage = useCallback(() => {
    const nextLangIndex =
      (LANGUAGE_OPTIONS.findIndex((lang) => lang.code === voiceSettings.language) + 1) %
      LANGUAGE_OPTIONS.length;
    const nextLang = LANGUAGE_OPTIONS[nextLangIndex];
    changeLanguage(nextLang.code);
  }, [voiceSettings.language, changeLanguage]);

  return {
    voiceSettings,
    setVoiceSettings,
    handleVoicePreview,
    changeLanguage,
    cycleLanguage,
  };
}
