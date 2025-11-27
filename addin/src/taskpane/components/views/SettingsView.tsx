import React from "react";
import { Button } from "@ui/button";
import { ArrowLeft, Globe } from "lucide-react";
import { VoiceSettings, VoiceSettingsValue } from "@components/VoiceSettings";

export interface SettingsViewProps {
  onNavigateBack: () => void;
  voiceSettings: VoiceSettingsValue;
  onVoiceSettingsChange: (settings: VoiceSettingsValue) => void;
  onVoicePreview: (settings: VoiceSettingsValue) => Promise<void>;
  buildBackendUrl: (path: string) => string;
  disabled?: boolean;
  languageOptions: Array<{ code: string; name: string }>;
}

/**
 * Voice settings view with back navigation
 */
export function SettingsView({
  onNavigateBack,
  voiceSettings,
  onVoiceSettingsChange,
  onVoicePreview,
  buildBackendUrl,
  disabled = false,
  languageOptions,
}: SettingsViewProps) {
  const handleLanguageChange = () => {
    if (!languageOptions?.length) return;
    const nextLangIndex =
      (languageOptions.findIndex((lang) => lang.code === voiceSettings.language) + 1) %
      languageOptions.length;
    const nextLang = languageOptions[nextLangIndex];
    onVoiceSettingsChange({ ...voiceSettings, language: nextLang.code });
  };

  return (
    <div className="narration-view narration-view--settings">
      <div className="narration-back-header">
        <Button
          variant="secondary"
          size="sm"
          onClick={onNavigateBack}
          className="narration-back-btn"
        >
          <ArrowLeft className="narration-btn-icon" />
        </Button>
        <span className="narration-back-text">Go Back</span>
        {languageOptions?.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLanguageChange}
            className="narration-language-toggle"
            title="Change narration language"
            aria-label={`Current language: ${voiceSettings.language}. Click to change language.`}
          >
            <Globe className="narration-btn-icon" />
            <span className="narration-language-code">{voiceSettings.language}</span>
          </Button>
        )}
      </div>
      <VoiceSettings
        value={voiceSettings}
        onChange={onVoiceSettingsChange}
        onPreview={onVoicePreview}
        buildBackendUrl={buildBackendUrl}
        disabled={disabled}
      />
    </div>
  );
}
