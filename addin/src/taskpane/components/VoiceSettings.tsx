import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@ui/button";
import { Slider } from "@ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Card } from "@ui/card";
import { Badge } from "@ui/badge";
import { RefreshCw, Volume2, Gauge, Sparkles, Music, Globe, Wand2, Play, Plus } from "lucide-react";
import { apiClient } from "@utils/apiClient";

export type VoiceProvider = "azure" | "openai" | "own";

export interface VoiceSettingsValue {
  provider: VoiceProvider;
  voiceName: string;
  speed: number; // 0.5 - 2.0
  pitch: number; // -50 - 50 (for azure/openai providers)
  exaggeration: number; // 0.25 - 2.0 (for own/custom cloned voices)
  volume: number; // 0.1 - 2.0 multiplier
  tone: "professional" | "casual" | "enthusiastic" | "calm";
  language: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsValue = {
  provider: "azure",
  voiceName: "en-US-AriaNeural",
  speed: 1.0,
  pitch: 0,
  exaggeration: 0.5,
  volume: 1.0,
  tone: "professional",
  language: "en-US",
};

interface VoiceSettingsProps {
  value: VoiceSettingsValue;
  onChange: (value: VoiceSettingsValue) => void;
  onPreview: (settings: VoiceSettingsValue) => Promise<void> | void;
  buildBackendUrl: (path: string) => string;
  disabled?: boolean;
  onNavigateToVoiceUpload?: () => void;
}

interface VoiceOption {
  id: string;
  label: string;
  provider: VoiceProvider;
  language: string;
  profileId?: string;
}

interface SavedProfile {
  id: string;
  name: string;
  provider: VoiceProvider;
  voice: string;
  speed: number;
  pitch: number;
  exaggeration: number;
  volume: number;
  tone: VoiceSettingsValue["tone"];
  language: string;
}

const DEFAULT_VOICES: VoiceOption[] = [
  { id: "en-US-AriaNeural", label: "Aria (English US)", provider: "azure", language: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy (English US)", provider: "azure", language: "en-US" },
  { id: "en-GB-LibbyNeural", label: "Libby (English UK)", provider: "azure", language: "en-GB" },
  { id: "alloy", label: "Alloy (English)", provider: "openai", language: "en-US" },
  { id: "versatile", label: "Versatile (English)", provider: "openai", language: "en-US" },
];

const TONE_OPTIONS: VoiceSettingsValue["tone"][] = [
  "professional",
  "casual",
  "enthusiastic",
  "calm",
];

export function VoiceSettings({
  value,
  onChange,
  onPreview,
  buildBackendUrl,
  disabled,
  onNavigateToVoiceUpload,
}: VoiceSettingsProps) {
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [customVoices, setCustomVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    const fetchVoices = async () => {
      setLoadingVoices(true);
      setError(null);
      try {
        const providers: VoiceProvider[] = ["azure", "openai"];
        const voiceLists = await Promise.all(
          providers.map(async (provider) => {
            try {
              const res = await apiClient.getAvailableVoices(provider);
              if (res.success && (res as any).data?.voices) {
                return (res as any).data.voices.map((voice: any) => ({
                  id: voice.name,
                  label: voice.display_name || voice.name,
                  provider,
                  language: voice.language || (provider === "azure" ? "en-US" : "en-US"),
                })) as VoiceOption[];
              }
            } catch (err) {
              console.warn(`Unable to load voices for ${provider}`, err);
            }
            return [];
          })
        );
        const flattened = voiceLists.flat();
        if (flattened.length > 0) {
          setAvailableVoices(flattened);
        }
      } catch (err) {
        console.warn("Voice fetch failed, using defaults", err);
        setError(err instanceof Error ? err.message : "Unable to load voices");
      } finally {
        setLoadingVoices(false);
      }
    };

    const fetchProfiles = async () => {
      try {
        const response = await apiClient.getVoiceProfiles();
        if (response.success && Array.isArray(response.data)) {
          setProfiles(
            response.data.map((profile: any) => ({
              id: profile.id,
              name: profile.name,
              provider:
                profile.voice_type === "custom_cloned"
                  ? "own"
                  : profile.settings?.provider ?? profile.provider ?? "azure",
              voice:
                profile.voice ??
                profile.settings?.voice ??
                profile.voiceName ??
                "en-US-AriaNeural",
              speed: profile.settings?.speed ?? profile.speed ?? 1.0,
              pitch: profile.settings?.pitch ?? profile.pitch ?? 0,
              exaggeration: profile.settings?.exaggeration ?? profile.exaggeration ?? 0.5,
              volume: profile.settings?.volume ?? profile.volume ?? 1.0,
              tone: (profile.settings?.tone ?? profile.tone ?? "professional") as VoiceSettingsValue["tone"],
              language: profile.settings?.language ?? profile.language ?? "en-US",
            }))
          );
        }
      } catch (err) {
        console.warn("Unable to load saved profiles", err);
      }
    };

    fetchVoices();
    fetchProfiles();
  }, [buildBackendUrl]);

  // Fetch custom voices when provider is "own"
  useEffect(() => {
    const fetchCustomVoices = async () => {
      try {
        setLoadingVoices(true);
        // Prefer full voice profiles and filter for custom_cloned
        const profileResp = await apiClient.getVoiceProfiles();
        let customList: VoiceOption[] = [];
        if (profileResp.success && Array.isArray(profileResp.data)) {
          customList = profileResp.data
            .filter((p: any) => (p.voice_type || p.voiceType) === "custom_cloned")
            .map((p: any) => ({
              id: p.voice || p.id,
              profileId: p.id,
              label: p.name,
              provider: "own" as VoiceProvider,
              language: p.language ?? "en-US",
            }));
        }
        // Fallback to custom-voices endpoint if needed
        if (customList.length === 0) {
          const response = await apiClient.getCustomVoices();
          if (Array.isArray(response)) {
            customList = response.map((profile: any) => ({
              id: profile.voice || profile.id,
              profileId: profile.id,
              label: profile.name,
              provider: "own" as VoiceProvider,
              language: profile.language ?? "en-US",
            }));
          } else if ((response as any)?.data && Array.isArray((response as any).data)) {
            customList = (response as any).data.map((profile: any) => ({
              id: profile.voice || profile.id,
              profileId: profile.id,
              label: profile.name,
              provider: "own" as VoiceProvider,
              language: profile.language ?? "en-US",
            }));
          }
        }
        setCustomVoices(customList);
      } catch (err) {
        console.warn("Failed to fetch custom voices", err);
        setCustomVoices([]);
      } finally {
        setLoadingVoices(false);
      }
    };

    fetchCustomVoices();
  }, [value.provider, buildBackendUrl]);

  const filteredVoices = useMemo(
    () => {
      if (value.provider === "own") {
        return customVoices;
      }
      return availableVoices.filter((voice) => voice.provider === value.provider);
    },
    [availableVoices, customVoices, value.provider]
  );

  useEffect(() => {
    if (filteredVoices.length === 0) {
      return;
    }
    const voiceExists = filteredVoices.some((voice) => voice.id === value.voiceName);
    if (!voiceExists) {
      const nextVoice = filteredVoices[0];
      onChange({ ...value, voiceName: nextVoice.id, language: nextVoice.language });
    }
  }, [filteredVoices, value, onChange]);

  const handleVoiceChange = (voiceId: string) => {
    const voice = [...customVoices, ...availableVoices].find((option) => option.id === voiceId);
    onChange({
      ...value,
      voiceName: voiceId,
      language: voice?.language ?? value.language,
    });
  };

  const handleSliderChange = (key: "speed" | "pitch" | "volume", val: number[]) => {
    const next = val[0];
    onChange({ ...value, [key]: next });
  };

  const handleApplyProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    onChange({
      provider: profile.provider,
      voiceName: profile.voice,
      speed: profile.speed,
      pitch: profile.pitch,
      exaggeration: profile.exaggeration,
      volume: profile.volume,
      tone: profile.tone,
      language: profile.language,
    });
    setProfileStatus(`Applied profile "${profile.name}".`);
  };

  const handleSaveProfile = async () => {
    const name = window.prompt("Profile name");
    if (!name) {
      return;
    }
    setProfileStatus("Saving profile...");
    try {
      const response = await apiClient.createVoiceProfile({
        name,
        description: "Saved from add-in voice settings panel",
        settings: {
          provider: value.provider,
          voice: value.voiceName,
          language: value.language,
          tone: value.tone,
          speed: value.speed,
          pitch: value.pitch,
          exaggeration: value.exaggeration,
          volume: value.volume,
        } as any,
      });
      if (!response.success) {
        throw new Error(response.error || "Profile save failed");
      }
      setProfileStatus(`Saved profile "${name}".`);
      const refreshed = await apiClient.getVoiceProfiles();
      if (refreshed.success && Array.isArray(refreshed.data)) {
        setProfiles(
          refreshed.data.map((profile: any) => ({
            id: profile.id,
            name: profile.name,
            provider:
              profile.voice_type === "custom_cloned"
                ? "own"
                : profile.settings?.provider ?? profile.provider ?? "azure",
            voice:
              profile.voice ??
              profile.settings?.voice ??
              profile.voiceName ??
              value.voiceName,
            speed: profile.settings?.speed ?? profile.speed ?? value.speed,
            pitch: profile.settings?.pitch ?? profile.pitch ?? value.pitch,
            exaggeration: profile.settings?.exaggeration ?? profile.exaggeration ?? value.exaggeration,
            volume: profile.settings?.volume ?? profile.volume ?? value.volume,
            tone: (profile.settings?.tone ?? profile.tone ?? value.tone) as VoiceSettingsValue["tone"],
            language: profile.settings?.language ?? profile.language ?? value.language,
          }))
        );
      }
    } catch (err) {
      console.error("Save profile error", err);
      setProfileStatus(err instanceof Error ? err.message : "Failed to save profile.");
    }
  };

  return (
    <Card className="voice-settings">
      <div className="voice-settings__header">
        <div>
          <h3 className="voice-settings__title">Voice Configuration</h3>
          <p className="voice-settings__subtitle">
            Choose a provider and fine-tune narration delivery.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="voice-settings__refresh"
          onClick={() => {
            setAvailableVoices(DEFAULT_VOICES);
            setError(null);
            onChange(DEFAULT_VOICE_SETTINGS);
          }}
          disabled={disabled}
        >
          <RefreshCw className="voice-settings__icon" /> Reset
        </Button>
      </div>

      <div className="voice-settings__grid">
        <div className="voice-settings__field">
          <label className="voice-settings__label">Provider</label>
          <Select
            value={value.provider}
            onValueChange={(provider) =>
              onChange({ ...value, provider: provider as VoiceProvider })
            }
          >
            <SelectTrigger className="voice-settings__select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="azure">Azure Cognitive Services</SelectItem>
              <SelectItem value="openai">OpenAI Realtime Voice</SelectItem>
              <SelectItem value="own">Own Voice</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="voice-settings__field">
          <label className="voice-settings__label">Voice</label>
          {value.provider === "own" && filteredVoices.length === 0 && !loadingVoices ? (
            <div className="voice-settings__create-voice">
              <p className="voice-settings__hint">No custom voices available. Create one to get started.</p>
              {onNavigateToVoiceUpload && (
                <Button
                  size="sm"
                  onClick={onNavigateToVoiceUpload}
                  disabled={disabled}
                  className="voice-settings__create-voice-btn"
                >
                  <Plus className="voice-settings__icon" /> Create Voice
                </Button>
              )}
            </div>
          ) : (
            <>
              <Select value={value.voiceName} onValueChange={handleVoiceChange}>
                <SelectTrigger className="voice-settings__select">
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
              {value.provider === "own" && onNavigateToVoiceUpload && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onNavigateToVoiceUpload}
                  disabled={disabled}
                  className="voice-settings__create-voice-btn voice-settings__create-voice-btn--compact"
                >
                  <Plus className="voice-settings__icon" /> Create Voice
                </Button>
              )}
              <div className="voice-settings__hint">
                {loadingVoices ? "Loading voices..." : voiceSettingsSummary(value, value.provider === "own" ? customVoices : availableVoices)}
              </div>
            </>
          )}
        </div>

        <div className="voice-settings__field">
          <label className="voice-settings__label">Tone</label>
          <Select
            value={value.tone}
            onValueChange={(tone) =>
              onChange({ ...value, tone: tone as VoiceSettingsValue["tone"] })
            }
          >
            <SelectTrigger className="voice-settings__select">
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

        <div className="voice-settings__field">
          <label className="voice-settings__label">Language</label>
          <div className="voice-settings__language">
            <Globe className="voice-settings__icon" />
            <span>{value.language}</span>
          </div>
        </div>
      </div>

      <div className="voice-settings__sliders">
        <div className="voice-settings__slider">
          <label className="voice-settings__label">
            <Gauge className="voice-settings__icon" /> Speed {value.speed.toFixed(2)}x
          </label>
          <Slider
            value={[value.speed]}
            onValueChange={(val) => handleSliderChange("speed", val)}
            min={0.5}
            max={2.0}
            step={0.05}
          />
        </div>
        {value.provider === "own" ? (
          <div className="voice-settings__slider">
            <label className="voice-settings__label">
              <Sparkles className="voice-settings__icon" /> Exaggeration {value.exaggeration.toFixed(2)}
            </label>
            <Slider
              value={[value.exaggeration]}
              onValueChange={(val) => handleSliderChange("exaggeration", val)}
              min={0.25}
              max={2.0}
              step={0.05}
            />
            <p className="voice-settings__hint" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
              Lower (0.25–0.5): Calmer, more controlled speech
              <br />
              Higher (0.5–2.0): More expressive, energetic speech
            </p>
          </div>
        ) : (
          <div className="voice-settings__slider">
            <label className="voice-settings__label">
              <Music className="voice-settings__icon" /> Pitch {value.pitch.toFixed(1)}
            </label>
            <Slider
              value={[value.pitch]}
              onValueChange={(val) => handleSliderChange("pitch", val)}
              min={-50}
              max={50}
              step={1}
            />
          </div>
        )}
        <div className="voice-settings__slider">
          <label className="voice-settings__label">
            <Volume2 className="voice-settings__icon" /> Volume {(value.volume * 100).toFixed(0)}%
          </label>
          <Slider
            value={[value.volume]}
            onValueChange={(val) => handleSliderChange("volume", val)}
            min={0.1}
            max={2.0}
            step={0.05}
          />
        </div>
      </div>

      {error && <div className="voice-settings__error">{error}</div>}
      {profileStatus && <div className="voice-settings__hint">{profileStatus}</div>}

      <div className="voice-settings__profiles">
        <label className="voice-settings__label">Saved Profiles</label>
        <div className="voice-settings__profile-row">
          <Select value={selectedProfileId} onValueChange={handleApplyProfile}>
            <SelectTrigger className="voice-settings__select">
              <SelectValue placeholder="Choose profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.length === 0 && <SelectItem value="">None available</SelectItem>}
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleSaveProfile} disabled={disabled}>
            Save profile
          </Button>
        </div>
      </div>

      <div className="voice-settings__footer">
        <Badge variant="secondary">Tone: {titleCase(value.tone)}</Badge>
        <div className="voice-settings__actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange(DEFAULT_VOICE_SETTINGS)}
            disabled={disabled}
          >
            <Wand2 className="voice-settings__icon" /> Reset settings
          </Button>
          <Button size="sm" onClick={() => onPreview(value)} disabled={disabled}>
            <Play className="voice-settings__icon" /> Preview voice
          </Button>
        </div>
      </div>
    </Card>
  );
}

function titleCase(text: string) {
  return text.replace(/(^|\s)([a-z])/g, (_, space, char) => `${space}${char.toUpperCase()}`);
}

function voiceSettingsSummary(value: VoiceSettingsValue, voices: VoiceOption[]) {
  const voice = voices.find((option) => option.id === value.voiceName);
  if (!voice) {
    return `${value.voiceName}`;
  }
  return `${voice.label} - ${voice.language}`;
}
