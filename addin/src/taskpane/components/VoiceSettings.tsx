import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@ui/button";
import { Slider } from "@ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Card } from "@ui/card";
import { Badge } from "@ui/badge";
import { RefreshCw, Volume2, Gauge, Music, Globe, Wand2, Play } from "lucide-react";

export type VoiceProvider = "azure" | "openai";

export interface VoiceSettingsValue {
  provider: VoiceProvider;
  voiceName: string;
  speed: number; // 0.5 - 2.0
  pitch: number; // -50 - 50 semitones
  volume: number; // 0.1 - 2.0 multiplier
  tone: "professional" | "casual" | "enthusiastic" | "calm";
  language: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsValue = {
  provider: "azure",
  voiceName: "en-US-AriaNeural",
  speed: 1.0,
  pitch: 0,
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
}

interface VoiceOption {
  id: string;
  label: string;
  provider: VoiceProvider;
  language: string;
}

interface SavedProfile {
  id: string;
  name: string;
  provider: VoiceProvider;
  voice: string;
  speed: number;
  pitch: number;
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
}: VoiceSettingsProps) {
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  useEffect(() => {
    const fetchVoices = async () => {
      setLoadingVoices(true);
      setError(null);
      try {
        const response = await fetch(buildBackendUrl("/api/v1/tts/drivers"), {
          headers: { Authorization: "Bearer test_token" },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch voices (${response.status})`);
        }
        const data = await response.json();
        const drivers = data?.drivers ?? {};
        const parsed: VoiceOption[] = [];
        Object.entries(drivers).forEach(([providerKey, details]) => {
          const provider = providerKey === "openai" ? "openai" : "azure";
          const voices = (details as any)?.supported_voices ?? [];
          voices.forEach((voice: string) => {
            parsed.push({
              id: voice,
              label: voice,
              provider,
              language: provider === "azure" ? voice.split("-").slice(0, 2).join("-") : "en-US",
            });
          });
        });
        if (parsed.length > 0) {
          setAvailableVoices(parsed);
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
        const response = await fetch(buildBackendUrl("/api/v1/voice-profiles/list"), {
          headers: { Authorization: "Bearer test_token" },
        });
        if (!response.ok) {
          throw new Error(`Failed to load profiles (${response.status})`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          setProfiles(
            data.map((profile) => ({
              id: profile.id,
              name: profile.name,
              provider: profile.provider ?? "azure",
              voice: profile.voice ?? profile.voiceName ?? "en-US-AriaNeural",
              speed: profile.speed ?? 1.0,
              pitch: profile.pitch ?? 0,
              volume: profile.volume ?? 1.0,
              tone: (profile.tone ?? "professional") as VoiceSettingsValue["tone"],
              language: profile.language ?? "en-US",
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

  const filteredVoices = useMemo(
    () => availableVoices.filter((voice) => voice.provider === value.provider),
    [availableVoices, value.provider]
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
    const voice = availableVoices.find((option) => option.id === voiceId);
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
      volume: profile.volume,
      tone: profile.tone,
      language: profile.language,
    });
    setProfileStatus(`Applied profile “${profile.name}”.`);
  };

  const handleSaveProfile = async () => {
    const name = window.prompt("Profile name");
    if (!name) {
      return;
    }
    setProfileStatus("Saving profile...");
    try {
      const response = await fetch(buildBackendUrl("/api/v1/voice-profiles/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test_token",
        },
        body: JSON.stringify({
          name,
          description: "Saved from add-in debug panel",
          voice: value.voiceName,
          language: value.language,
          style: value.tone,
          speed: value.speed,
          pitch: value.pitch,
          volume: value.volume,
        }),
      });
      if (!response.ok) {
        throw new Error(`Profile save failed (${response.status})`);
      }
      setProfileStatus(`Saved profile “${name}”.`);
      const refreshed = await fetch(buildBackendUrl("/api/v1/voice-profiles/list"), {
        headers: { Authorization: "Bearer test_token" },
      });
      if (refreshed.ok) {
        const data = await refreshed.json();
        if (Array.isArray(data)) {
          setProfiles(
            data.map((profile) => ({
              id: profile.id,
              name: profile.name,
              provider: profile.provider ?? "azure",
              voice: profile.voice ?? profile.voiceName ?? value.voiceName,
              speed: profile.speed ?? value.speed,
              pitch: profile.pitch ?? value.pitch,
              volume: profile.volume ?? value.volume,
              tone: (profile.tone ?? value.tone) as VoiceSettingsValue["tone"],
              language: profile.language ?? value.language,
            }))
          );
        }
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
            </SelectContent>
          </Select>
        </div>

        <div className="voice-settings__field">
          <label className="voice-settings__label">Voice</label>
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
          <div className="voice-settings__hint">
            {loadingVoices ? "Loading voices..." : voiceSettingsSummary(value, availableVoices)}
          </div>
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
  return `${voice.label} · ${voice.language}`;
}
