import React, { useState } from 'react';
import { Card } from '@ui/card';
import { Button } from '@ui/button';
import { Textarea } from '@ui/textarea';
import { Badge } from '@ui/badge';
import { Separator } from '@ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select';
import { Slider } from '@ui/slider';
import { Play, Pause, RotateCcw, Mic, FileText, Clock, Settings, Volume2, Gauge, Palette } from 'lucide-react';

interface NarrationScript {
  id: string;
  slideId: string;
  script: string;
  duration: number; // in seconds
  generatedAt: Date;
}

interface TTSSettings {
  voice: string;
  speed: number; // 0.5 - 2.0
  pitch: number; // 0.5 - 2.0
  volume: number; // 0 - 1
  tone: string;
  language: string;
}

interface NarrationPanelProps {
  slideId: string;
  slideTitle: string;
  slideContent: string;
  script?: NarrationScript;
  onScriptUpdate: (script: NarrationScript) => void;
  onGenerateScript: (slideId: string, content: string) => void;
}

export function NarrationPanel({
  slideId,
  slideTitle,
  slideContent,
  script,
  onScriptUpdate,
  onGenerateScript
}: NarrationPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTTSControls, setShowTTSControls] = useState(false);
  
  const [ttsSettings, setTTSSettings] = useState<TTSSettings>({
    voice: 'sarah',
    speed: 1.0,
    pitch: 1.0,
    volume: 0.8,
    tone: 'professional',
    language: 'en-US'
  });

  const voices = [
    { id: 'sarah', name: 'Sarah', description: 'Warm, professional female voice' },
    { id: 'david', name: 'David', description: 'Clear, confident male voice' },
    { id: 'emma', name: 'Emma', description: 'Friendly, engaging female voice' },
    { id: 'james', name: 'James', description: 'Deep, authoritative male voice' },
    { id: 'aria', name: 'Aria', description: 'Energetic, youthful female voice' },
    { id: 'marcus', name: 'Marcus', description: 'Calm, reassuring male voice' }
  ];

  const tones = [
    { id: 'professional', name: 'Professional', description: 'Business-appropriate tone' },
    { id: 'conversational', name: 'Conversational', description: 'Friendly and approachable' },
    { id: 'enthusiastic', name: 'Enthusiastic', description: 'Energetic and engaging' },
    { id: 'calm', name: 'Calm', description: 'Steady and reassuring' },
    { id: 'authoritative', name: 'Authoritative', description: 'Confident and commanding' },
    { id: 'empathetic', name: 'Empathetic', description: 'Warm and understanding' }
  ];

  const languages = [
    { id: 'en-US', name: 'English (US)' },
    { id: 'en-GB', name: 'English (UK)' },
    { id: 'en-AU', name: 'English (AU)' },
    { id: 'es-ES', name: 'Spanish' },
    { id: 'fr-FR', name: 'French' },
    { id: 'de-DE', name: 'German' },
    { id: 'it-IT', name: 'Italian' },
    { id: 'pt-BR', name: 'Portuguese' }
  ];

  const handleGenerateScript = async () => {
    setIsGenerating(true);
    // Simulate AI script generation
    setTimeout(() => {
      const newScript: NarrationScript = {
        id: `script-${Date.now()}`,
        slideId,
        script: generateMockScript(slideTitle, slideContent),
        duration: Math.round(45 / ttsSettings.speed), // Adjust duration based on speed
        generatedAt: new Date()
      };
      onScriptUpdate(newScript);
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
      const sentences = content.split('.').filter(s => s.trim().length > 0);
      if (sentences.length > 0) {
        script += `Here we can see that ${sentences[0].toLowerCase().trim()}. `;
        if (sentences.length > 1) {
          script += `Additionally, ${sentences[1].toLowerCase().trim()}. `;
        }
      }
    }
    
    script += "This information is crucial for understanding our overall objectives and will guide us through the next steps.";
    return script;
  };

  const handleScriptChange = (newScript: string) => {
    if (script) {
      const updatedScript = { ...script, script: newScript };
      onScriptUpdate(updatedScript);
    }
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    // In a real app, this would control text-to-speech with current settings
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateTTSSettings = (key: keyof TTSSettings, value: any) => {
    setTTSSettings(prev => ({ ...prev, [key]: value }));
  };

  const getSpeedLabel = (speed: number) => {
    if (speed <= 0.7) return 'Slow';
    if (speed <= 1.3) return 'Normal';
    return 'Fast';
  };

  const getPitchLabel = (pitch: number) => {
    if (pitch <= 0.7) return 'Low';
    if (pitch <= 1.3) return 'Normal';
    return 'High';
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Narration Script
        </h3>
        <div className="flex items-center gap-2">
          {script && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {formatDuration(script.duration)}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTTSControls(!showTTSControls)}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Voice
          </Button>
        </div>
      </div>

      {/* TTS Controls */}
      {showTTSControls && (
        <Card className="p-3 mb-4 border-dashed">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Voice Selection */}
              <div>
                <label className="block text-sm mb-2">Voice</label>
                <Select
                  value={ttsSettings.voice}
                  onValueChange={(value) => updateTTSSettings('voice', value)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        <div>
                          <div className="font-medium">{voice.name}</div>
                          <div className="text-xs text-muted-foreground">{voice.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm mb-2">Language</label>
                <Select
                  value={ttsSettings.language}
                  onValueChange={(value) => updateTTSSettings('language', value)}
                >
                  <SelectTrigger className="text-sm">
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
            </div>

            {/* Tone Selection */}
            <div>
              <label className="block text-sm mb-2 flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Tone
              </label>
              <Select
                value={ttsSettings.tone}
                onValueChange={(value) => updateTTSSettings('tone', value)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tones.map((tone) => (
                    <SelectItem key={tone.id} value={tone.id}>
                      <div>
                        <div className="font-medium">{tone.name}</div>
                        <div className="text-xs text-muted-foreground">{tone.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed Control */}
            <div>
              <label className="block text-sm mb-2 flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Speed: {getSpeedLabel(ttsSettings.speed)} ({ttsSettings.speed.toFixed(1)}x)
              </label>
              <Slider
                value={[ttsSettings.speed]}
                onValueChange={(value) => updateTTSSettings('speed', value[0])}
                min={0.5}
                max={2.0}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Pitch Control */}
            <div>
              <label className="block text-sm mb-2">
                Pitch: {getPitchLabel(ttsSettings.pitch)} ({ttsSettings.pitch.toFixed(1)}x)
              </label>
              <Slider
                value={[ttsSettings.pitch]}
                onValueChange={(value) => updateTTSSettings('pitch', value[0])}
                min={0.5}
                max={2.0}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Low</span>
                <span>Normal</span>
                <span>High</span>
              </div>
            </div>

            {/* Volume Control */}
            <div>
              <label className="block text-sm mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Volume: {Math.round(ttsSettings.volume * 100)}%
              </label>
              <Slider
                value={[ttsSettings.volume]}
                onValueChange={(value) => updateTTSSettings('volume', value[0])}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex-1 flex flex-col">
        {script ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-xs">
                Generated {script.generatedAt.toLocaleTimeString()}
              </Badge>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Mic className="w-3 h-3" />
                {voices.find(v => v.id === ttsSettings.voice)?.name}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {ttsSettings.speed}x speed
              </Badge>
            </div>
            
            <Textarea
              value={script.script}
              onChange={(e) => handleScriptChange(e.target.value)}
              placeholder="Your narration script will appear here..."
              className="flex-1 min-h-[200px] mb-4 resize-none"
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isPlaying ? "secondary" : "default"}
                onClick={togglePlayback}
                className="flex items-center gap-2"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Play
                  </>
                )}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateScript}
                disabled={isGenerating}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Regenerate
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h4 className="font-medium mb-2">No narration script yet</h4>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Generate an AI-powered narration script based on your slide content
            </p>
            <Button
              onClick={handleGenerateScript}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Script
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}