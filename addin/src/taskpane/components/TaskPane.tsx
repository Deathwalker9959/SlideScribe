import React, { useState, useEffect } from "react";
import { Card } from "@ui/card";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Slider } from "@ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { ScrollArea } from "@ui/scroll-area";
import {
  Play,
  Pause,
  RotateCcw,
  Mic,
  FileText,
  Clock,
  Settings,
  Volume2,
  Gauge,
  Palette,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Suggestion {
  id: string;
  type: "grammar" | "style" | "clarity";
  text: string;
  suggestion: string;
  position: { start: number; end: number };
}

interface NarrationScript {
  id: string;
  script: string;
  duration: number;
  generatedAt: Date;
}

interface TTSSettings {
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
  tone: string;
  language: string;
}

interface TaskPaneProps {
  slideContent?: string;
  slideTitle?: string;
  onTextUpdate?: (text: string) => void;
}

export function TaskPane({ slideContent = "", slideTitle = "", onTextUpdate }: TaskPaneProps) {
  const [activeTab, setActiveTab] = useState("suggestions");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [narrationScript, setNarrationScript] = useState<NarrationScript | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTTSControls, setShowTTSControls] = useState(false);

  const [ttsSettings, setTTSSettings] = useState<TTSSettings>({
    voice: "sarah",
    speed: 1.0,
    pitch: 1.0,
    volume: 0.8,
    tone: "professional",
    language: "en-US",
  });

  const voices = [
    { id: "sarah", name: "Sarah", description: "Warm, professional female voice" },
    { id: "david", name: "David", description: "Clear, confident male voice" },
    { id: "emma", name: "Emma", description: "Friendly, engaging female voice" },
    { id: "james", name: "James", description: "Deep, authoritative male voice" },
    { id: "aria", name: "Aria", description: "Energetic, youthful female voice" },
    { id: "marcus", name: "Marcus", description: "Calm, reassuring male voice" },
  ];

  const tones = [
    { id: "professional", name: "Professional", description: "Business-appropriate tone" },
    { id: "conversational", name: "Conversational", description: "Friendly and approachable" },
    { id: "enthusiastic", name: "Enthusiastic", description: "Energetic and engaging" },
    { id: "calm", name: "Calm", description: "Steady and reassuring" },
    { id: "authoritative", name: "Authoritative", description: "Confident and commanding" },
    { id: "empathetic", name: "Empathetic", description: "Warm and understanding" },
  ];

  const languages = [
    { id: "en-US", name: "English (US)" },
    { id: "en-GB", name: "English (UK)" },
    { id: "en-AU", name: "English (AU)" },
    { id: "es-ES", name: "Spanish" },
    { id: "fr-FR", name: "French" },
    { id: "de-DE", name: "German" },
  ];

  // Generate mock suggestions based on content
  useEffect(() => {
    const generateSuggestions = () => {
      const mockSuggestions: Suggestion[] = [];
      const content = slideContent + " " + slideTitle;

      if (content.includes("will")) {
        mockSuggestions.push({
          id: "sug-1",
          type: "style",
          text: "will discuss",
          suggestion: 'Consider using "we\'ll explore" for a more engaging tone',
          position: { start: 0, end: 0 },
        });
      }

      if (content.length > 200) {
        mockSuggestions.push({
          id: "sug-2",
          type: "clarity",
          text: "This is a long sentence",
          suggestion: "Consider breaking this into shorter, more digestible sentences",
          position: { start: 0, end: 0 },
        });
      }

      if (slideTitle.length > 50) {
        mockSuggestions.push({
          id: "sug-3",
          type: "clarity",
          text: slideTitle,
          suggestion: "Slide titles work best when kept under 50 characters",
          position: { start: 0, end: 0 },
        });
      }

      if (content.includes("basically") || content.includes("actually")) {
        mockSuggestions.push({
          id: "sug-4",
          type: "style",
          text: "basically",
          suggestion: "Remove filler words for more professional presentation",
          position: { start: 0, end: 0 },
        });
      }

      setSuggestions(mockSuggestions);
    };

    generateSuggestions();
  }, [slideContent, slideTitle]);

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case "grammar":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "style":
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case "clarity":
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getSuggestionColor = (type: string) => {
    switch (type) {
      case "grammar":
        return "bg-red-50 border-red-200";
      case "style":
        return "bg-yellow-50 border-yellow-200";
      case "clarity":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const handleApplySuggestion = (suggestionId: string) => {
    setSuggestions(suggestions.filter((s) => s.id !== suggestionId));
  };

  const handleGenerateScript = async () => {
    setIsGenerating(true);
    setTimeout(() => {
      const newScript: NarrationScript = {
        id: `script-${Date.now()}`,
        script: generateMockScript(slideTitle, slideContent),
        duration: Math.round(45 / ttsSettings.speed),
        generatedAt: new Date(),
      };
      setNarrationScript(newScript);
      setIsGenerating(false);
    }, 2000);
  };

  const generateMockScript = (title: string, content: string) => {
    if (!title && !content) {
      return "Let's begin our presentation. This slide will introduce our key concepts and set the foundation for our discussion.";
    }

    let script = "";
    if (title) {
      script += `Let's explore ${title.toLowerCase()}. `;
    }

    if (content) {
      const sentences = content.split(".").filter((s) => s.trim().length > 0);
      if (sentences.length > 0) {
        script += `Here we can see that ${sentences[0].toLowerCase().trim()}. `;
        if (sentences.length > 1) {
          script += `Additionally, ${sentences[1].toLowerCase().trim()}. `;
        }
      }
    }

    script +=
      "This information is crucial for understanding our overall objectives and will guide us through the next steps.";
    return script;
  };

  const handleScriptChange = (newScript: string) => {
    if (narrationScript) {
      setNarrationScript({ ...narrationScript, script: newScript });
    }
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const updateTTSSettings = (key: keyof TTSSettings, value: any) => {
    setTTSSettings((prev) => ({ ...prev, [key]: value }));
  };

  const getSpeedLabel = (speed: number) => {
    if (speed <= 0.7) return "Slow";
    if (speed <= 1.3) return "Normal";
    return "Fast";
  };

  return (
    <div id="taskpane-root" className="ui-taskpane">
      {/* Header */}
      <div className="ui-header">
        <h2 className="ui-header__title">Presentation Assistant</h2>
        <p className="ui-header__subtitle">Grammar, style & narration tools</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="ui-tabs">
        <div className="ui-tabs__bar">
          <TabsList className="ui-tabs__list">
            <TabsTrigger value="suggestions" className="ui-tab-trigger">
              <div className="ui-tab-trigger__content">
                <Lightbulb className="ui-icon ui-icon--sm" />
                <span>Suggestions</span>
                {suggestions.length > 0 && (
                  <Badge variant="secondary" className="ui-badge--small">
                    {suggestions.length}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
            <TabsTrigger value="narration" className="ui-tab-trigger">
              <div className="ui-tab-trigger__content">
                <Mic className="ui-icon ui-icon--sm" />
                <span>Narration</span>
                {narrationScript && (
                  <Badge variant="secondary" className="ui-badge--small">
                    <Clock className="ui-icon ui-icon--xs" />
                    {formatDuration(narrationScript.duration)}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="ui-tab-content ui-tab-content--suggestions">
          <ScrollArea className="ui-scroll-area">
            <div className="ui-suggestions-list">
              {suggestions.length === 0 ? (
                <div className="ui-empty-state">
                  <CheckCircle className="ui-icon ui-icon--lg" />
                  <p className="ui-empty-state__title">Looking good!</p>
                  <p className="ui-empty-state__desc">No suggestions at this time</p>
                </div>
              ) : (
                suggestions.map((suggestion) => (
                  <Card key={suggestion.id} className={`ui-card--suggestion`}>
                    <div className="ui-suggestion">
                      <div className="ui-suggestion__meta">
                        {getSuggestionIcon(suggestion.type)}
                        <Badge variant="outline" className="ui-badge--small ui-badge--caps">
                          {suggestion.type}
                        </Badge>
                      </div>
                      <div className="ui-suggestion__body">
                        <p className="ui-suggestion__original">
                          <span className="ui-strong">Original:</span> "{suggestion.text}"
                        </p>
                        <p className="ui-suggestion__text">
                          <span className="ui-strong">Suggestion:</span> {suggestion.suggestion}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleApplySuggestion(suggestion.id)}
                          className="ui-btn--block"
                        >
                          Apply Suggestion
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Narration Tab */}
        <TabsContent value="narration" className="ui-tab-content ui-tab-content--narration">
          <div className="ui-voice-controls">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTTSControls(!showTTSControls)}
              className="ui-btn--full"
            >
              <div className="ui-voice-controls__label">
                <Settings className="ui-icon ui-icon--sm" />
                Voice Settings
              </div>
              <div className="ui-voice-controls__chev">
                {showTTSControls ? (
                  <ChevronUp className="ui-icon ui-icon--sm" />
                ) : (
                  <ChevronDown className="ui-icon ui-icon--sm" />
                )}
              </div>
            </Button>
          </div>

          {/* TTS Controls */}
          {showTTSControls && (
            <Card className="ui-card--padded ui-card--dashed">
              <ScrollArea className="ui-scroll-area--small">
                <div className="ui-tts-controls">
                  <div className="ui-tts-controls__group">
                    <label className="ui-label">Voice</label>
                    <Select
                      value={ttsSettings.voice}
                      onValueChange={(value) => updateTTSSettings("voice", value)}
                    >
                      <SelectTrigger className="ui-select__trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            <div className="ui-select-item">
                              <div className="ui-select-item__title">{voice.name}</div>
                              <div className="ui-select-item__desc">{voice.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="ui-tts-controls__group">
                    <label className="ui-label">Language</label>
                    <Select
                      value={ttsSettings.language}
                      onValueChange={(value) => updateTTSSettings("language", value)}
                    >
                      <SelectTrigger className="ui-select__trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((lang) => (
                          <SelectItem key={lang.id} value={lang.id}>
                            {lang.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="ui-tts-controls__group">
                    <label className="ui-label ui-label--inline">
                      <Palette className="ui-icon ui-icon--sm" /> Tone
                    </label>
                    <Select
                      value={ttsSettings.tone}
                      onValueChange={(value) => updateTTSSettings("tone", value)}
                    >
                      <SelectTrigger className="ui-select__trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map((tone) => (
                          <SelectItem key={tone.id} value={tone.id}>
                            <div className="ui-select-item">
                              <div className="ui-select-item__title">{tone.name}</div>
                              <div className="ui-select-item__desc">{tone.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Audio Controls */}
                <div className="ui-audio-controls">
                  <div className="ui-audio-controls__group">
                    <label className="ui-label">
                      <Gauge className="ui-icon ui-icon--sm" /> Speed:{" "}
                      {getSpeedLabel(ttsSettings.speed)} ({ttsSettings.speed.toFixed(1)}x)
                    </label>
                    <Slider
                      value={[ttsSettings.speed]}
                      onValueChange={(value) => updateTTSSettings("speed", value[0])}
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      className="ui-slider"
                    />
                    <div className="ui-slider__ticks">
                      <span>0.5x</span>
                      <span>2.0x</span>
                    </div>
                  </div>

                  <div className="ui-audio-controls__group">
                    <label className="ui-label">
                      <Volume2 className="ui-icon ui-icon--sm" /> Volume:{" "}
                      {Math.round(ttsSettings.volume * 100)}%
                    </label>
                    <Slider
                      value={[ttsSettings.volume]}
                      onValueChange={(value) => updateTTSSettings("volume", value[0])}
                      min={0}
                      max={1}
                      step={0.1}
                      className="ui-slider"
                    />
                  </div>
                </div>
              </ScrollArea>
            </Card>
          )}

          {/* Script Area */}
          <div className="ui-script-area">
            {narrationScript ? (
              <>
                <div className="ui-script-meta">
                  <Badge variant="secondary" className="ui-badge--small">
                    Generated {narrationScript.generatedAt.toLocaleTimeString()}
                  </Badge>
                  <Badge variant="outline" className="ui-badge--small ui-badge--inline">
                    <Mic className="ui-icon ui-icon--xs" />
                    {voices.find((v) => v.id === ttsSettings.voice)?.name}
                  </Badge>
                </div>

                <Textarea
                  value={narrationScript.script}
                  onChange={(e) => handleScriptChange(e.target.value)}
                  placeholder="Your narration script will appear here..."
                  className="ui-textarea--large"
                />

                <div className="ui-script-actions">
                  <Button
                    size="sm"
                    variant={isPlaying ? "secondary" : "default"}
                    onClick={togglePlayback}
                    className="ui-btn--block ui-btn--center"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="ui-icon ui-icon--sm" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="ui-icon ui-icon--sm" />
                        Play
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateScript}
                    disabled={isGenerating}
                    className="ui-btn--block"
                  >
                    <RotateCcw className="ui-icon ui-icon--sm" />
                    Regenerate
                  </Button>
                </div>
              </>
            ) : (
              <div className="ui-empty-script">
                <FileText className="ui-icon ui-icon--lg ui-empty-script__icon" />
                <h4 className="ui-empty-script__title">No narration script yet</h4>
                <p className="ui-empty-script__desc">
                  Generate an AI-powered narration script based on your slide content
                </p>
                <Button
                  onClick={handleGenerateScript}
                  disabled={isGenerating}
                  className="ui-btn--center"
                >
                  {isGenerating ? (
                    <>
                      <RotateCcw className="ui-icon ui-icon--sm ui-anim-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="ui-icon ui-icon--sm" />
                      Generate Script
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
