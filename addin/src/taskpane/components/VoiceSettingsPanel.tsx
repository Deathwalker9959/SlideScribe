import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@ui/button";
import { Slider } from "@ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription } from "@ui/alert";
import {
  RefreshCw,
  Volume2,
  Gauge,
  Music,
  Globe,
  Wand2,
  Play,
  Loader2,
  Save,
  User,
} from "lucide-react";
import { apiClient, VoiceSettings, VoiceProfile } from "@utils/apiClient";

export type VoiceProvider = "azure" | "openai";

interface VoiceSettingsPanelProps {
  settings: VoiceSettings;
  onSettingsChange: (settings: VoiceSettings) => void;
}

interface VoiceOption {
  id: string;
  label: string;
  provider: VoiceProvider;
  language: string;
}

const DEFAULT_VOICES: VoiceOption[] = [
  { id: "en-US-AriaNeural", label: "Aria (English US)", provider: "azure", language: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy (English US)", provider: "azure", language: "en-US" },
  { id: "en-GB-LibbyNeural", label: "Libby (English UK)", provider: "azure", language: "en-GB" },
  { id: "alloy", label: "Alloy (English)", provider: "openai", language: "en-US" },
  { id: "versatile", label: "Versatile (English)", provider: "openai", language: "en-US" },
];

const TONE_OPTIONS: VoiceSettings["tone"][] = ["professional", "casual", "enthusiastic", "calm"];

export function VoiceSettingsPanel({ settings, onSettingsChange }: VoiceSettingsPanelProps) {
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    loadAvailableVoices();
    loadVoiceProfiles();
  }, []);

  const loadAvailableVoices = async () => {
    setLoadingVoices(true);
    setError(null);

    try {
      const response = await apiClient.getAvailableVoices(settings.provider);

      if (response.success && response.data) {
        const voices: VoiceOption[] = response.data.voices.map((voice: any) => ({
          id: voice.name,
          label: voice.display_name || voice.name,
          provider: settings.provider,
          language: voice.language || settings.language,
        }));

        if (voices.length > 0) {
          setAvailableVoices(voices);
        }
      }
    } catch (err) {
      console.warn("Failed to load voices from backend, using defaults:", err);
      setError("Unable to load voices from backend, using defaults");
    } finally {
      setLoadingVoices(false);
    }
  };

  const loadVoiceProfiles = async () => {
    try {
      const response = await apiClient.getVoiceProfiles();

      if (response.success && response.data) {
        setProfiles(response.data);
      }
    } catch (err) {
      console.warn("Failed to load voice profiles:", err);
      // Don't set error here as it's not critical
    }
  };

  const filteredVoices = useMemo(
    () => availableVoices.filter((voice) => voice.provider === settings.provider),
    [availableVoices, settings.provider]
  );

  useEffect(() => {
    if (filteredVoices.length === 0) {
      return;
    }

    const voiceExists = filteredVoices.some((voice) => voice.id === settings.voice);
    if (!voiceExists) {
      const nextVoice = filteredVoices[0];
      onSettingsChange({
        ...settings,
        voice: nextVoice.id,
        language: nextVoice.language,
      });
    }
  }, [filteredVoices, settings, onSettingsChange]);

  const handleProviderChange = async (provider: VoiceProvider) => {
    onSettingsChange({ ...settings, provider });

    // Reload voices for the new provider
    try {
      const response = await apiClient.getAvailableVoices(provider);
      if (response.success && response.data) {
        const voices: VoiceOption[] = response.data.voices.map((voice: any) => ({
          id: voice.name,
          label: voice.display_name || voice.name,
          provider,
          language: voice.language || settings.language,
        }));

        if (voices.length > 0) {
          setAvailableVoices(voices);
          // Auto-select first voice from new provider
          onSettingsChange({
            ...settings,
            provider,
            voice: voices[0].id,
            language: voices[0].language,
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load voices for new provider:", err);
    }
  };

  const handleVoiceChange = (voiceId: string) => {
    const voice = availableVoices.find((option) => option.id === voiceId);
    onSettingsChange({
      ...settings,
      voice: voiceId,
      language: voice?.language ?? settings.language,
    });
  };

  const handleSliderChange = (key: "speed" | "pitch" | "volume", val: number[]) => {
    const next = val[0];
    onSettingsChange({ ...settings, [key]: next });
  };

  const handlePreviewVoice = async () => {
    setIsPreviewing(true);
    setError(null);
    setStatusMessage("Generating voice preview...");

    try {
      const response = await apiClient.previewVoice(settings);

      if (response.success) {
        setStatusMessage("Voice preview generated successfully");
      } else {
        throw new Error(response.error || "Failed to generate preview");
      }
    } catch (err) {
      console.error("Voice preview failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate voice preview";
      setError(errorMessage);
      setStatusMessage(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyProfile = async (profileId: string) => {
    setSelectedProfileId(profileId);

    try {
      const response = await apiClient.getVoiceProfile(profileId);

      if (response.success && response.data) {
        onSettingsChange(response.data.settings);
        setStatusMessage(`Applied profile "${response.data.name}"`);
      } else {
        throw new Error(response.error || "Failed to load profile");
      }
    } catch (err) {
      console.error("Failed to apply profile:", err);
      setError("Failed to apply voice profile");
    }
  };

  const handleSaveProfile = async () => {
    const name = window.prompt("Enter a name for this voice profile:");
    if (!name) {
      return;
    }

    setIsSavingProfile(true);
    setStatusMessage("Saving voice profile...");

    try {
      const response = await apiClient.createVoiceProfile({
        name,
        description: "Created from Office Add-in",
        settings,
      });

      if (response.success) {
        setStatusMessage(`Profile "${name}" saved successfully`);
        setSelectedProfileId(response.data?.id || "");
        await loadVoiceProfiles(); // Reload profiles list
      } else {
        throw new Error(response.error || "Failed to save profile");
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to save voice profile";
      setError(errorMessage);
      setStatusMessage(null);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResetSettings = () => {
    const defaultSettings: VoiceSettings = {
      provider: "azure",
      voice: "en-US-AriaNeural",
      speed: 1.0,
      pitch: 0,
      volume: 1.0,
      tone: "professional",
      language: "en-US",
    };

    onSettingsChange(defaultSettings);
    setStatusMessage("Voice settings reset to defaults");
  };

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {statusMessage && !error && (
        <Alert>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Voice Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice Configuration
          </CardTitle>
          <CardDescription>
            Choose a provider and fine-tune narration delivery settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select value={settings.provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="azure">Azure Cognitive Services</SelectItem>
                  <SelectItem value="openai">OpenAI TTS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={settings.voice} onValueChange={handleVoiceChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingVoices && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading voices...
                </div>
              )}
            </div>
          </div>

          {/* Tone and Language */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tone</label>
              <Select
                value={settings.tone}
                onValueChange={(tone) =>
                  onSettingsChange({ ...settings, tone: tone as VoiceSettings["tone"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((toneOption) => (
                    <SelectItem key={toneOption} value={toneOption}>
                      {titleCase(toneOption)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-muted">
                <Globe className="h-4 w-4" />
                <span className="text-sm">{settings.language}</span>
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Speed {settings.speed.toFixed(2)}x
              </label>
              <Slider
                value={[settings.speed]}
                onValueChange={(val) => handleSliderChange("speed", val)}
                min={0.5}
                max={2.0}
                step={0.05}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Music className="h-4 w-4" />
                Pitch {settings.pitch.toFixed(1)}
              </label>
              <Slider
                value={[settings.pitch]}
                onValueChange={(val) => handleSliderChange("pitch", val)}
                min={-50}
                max={50}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Volume {(settings.volume * 100).toFixed(0)}%
              </label>
              <Slider
                value={[settings.volume]}
                onValueChange={(val) => handleSliderChange("volume", val)}
                min={0.1}
                max={2.0}
                step={0.05}
                className="w-full"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Badge variant="secondary">Tone: {titleCase(settings.tone)}</Badge>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleResetSettings}>
                <Wand2 className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button size="sm" onClick={handlePreviewVoice} disabled={isPreviewing}>
                {isPreviewing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Preview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Voice Profiles
          </CardTitle>
          <CardDescription>Save and load voice configuration profiles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={selectedProfileId} onValueChange={handleApplyProfile}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose a profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.length === 0 && (
                  <SelectItem value="" disabled>
                    No profiles available
                  </SelectItem>
                )}
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>

          {profiles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved profiles yet. Create one by clicking the save button above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function titleCase(text: string): string {
  return text.replace(/(^|\s)([a-z])/g, (_, space, char) => `${space}${char.toUpperCase()}`);
}
