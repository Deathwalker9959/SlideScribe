import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@ui/button';
import { Card } from '@ui/card';
import { Badge } from '@ui/badge';
import {
  Subtitles,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload
} from 'lucide-react';

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  slideId?: string;
  slideNumber?: number;
}

export interface SubtitleEditorProps {
  cues: SubtitleCue[];
  onChange: (cues: SubtitleCue[]) => void;
  totalDuration?: number;
  slideCount?: number;
  disabled?: boolean;
}

export function SubtitleEditor({
  cues: initialCues,
  onChange,
  totalDuration = 0,
  slideCount = 0,
  disabled = false
}: SubtitleEditorProps) {
  const [cues, setCues] = useState<SubtitleCue[]>(initialCues);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Sync with parent component
  useEffect(() => {
    setCues(initialCues);
  }, [initialCues]);

  // Notify parent of changes
  useEffect(() => {
    onChange(cues);
  }, [cues, onChange]);

  const selectedCue = cues.find(cue => cue.id === selectedCueId);

  const addCue = useCallback(() => {
    const newCue: SubtitleCue = {
      id: `cue-${Date.now()}`,
      startMs: currentTime,
      endMs: Math.min(currentTime + 3000, totalDuration || 60000),
      text: 'New subtitle text',
      slideNumber: Math.floor((currentTime / (totalDuration || 60000)) * slideCount) + 1
    };
    setCues(prev => [...prev, newCue].sort((a, b) => a.startMs - b.startMs));
    setSelectedCueId(newCue.id);
  }, [currentTime, totalDuration, slideCount]);

  const deleteCue = useCallback((cueId: string) => {
    setCues(prev => prev.filter(cue => cue.id !== cueId));
    if (selectedCueId === cueId) {
      setSelectedCueId(null);
    }
  }, [selectedCueId]);

  const updateCue = useCallback((cueId: string, updates: Partial<SubtitleCue>) => {
    setCues(prev => prev.map(cue =>
      cue.id === cueId ? { ...cue, ...updates } : cue
    ).sort((a, b) => a.startMs - b.startMs));
  }, []);

  const nudgeCueTiming = useCallback((cueId: string, startDelta: number, endDelta: number) => {
    setCues(prev => prev.map(cue => {
      if (cue.id !== cueId) return cue;
      return {
        ...cue,
        startMs: Math.max(0, cue.startMs + startDelta),
        endMs: Math.max(cue.startMs + 100, cue.endMs + endDelta)
      };
    }).sort((a, b) => a.startMs - b.startMs));
  }, []);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const validateCues = useCallback(() => {
    const issues: string[] = [];

    cues.forEach((cue, index) => {
      if (cue.startMs >= cue.endMs) {
        issues.push(`Cue ${index + 1}: Start time must be before end time`);
      }
      if (cue.text.trim().length === 0) {
        issues.push(`Cue ${index + 1}: Text cannot be empty`);
      }
      if (cue.text.length > 80) {
        issues.push(`Cue ${index + 1}: Text too long (${cue.text.length}/80 chars)`);
      }
    });

    // Check for overlaps
    for (let i = 0; i < cues.length - 1; i++) {
      if (cues[i].endMs > cues[i + 1].startMs) {
        issues.push(`Overlap: Cue ${i + 1} overlaps with Cue ${i + 2}`);
      }
    }

    return issues;
  }, [cues]);

  const autoFixCues = useCallback(() => {
    let fixedCues = [...cues];

    // Remove empty cues
    fixedCues = fixedCues.filter(cue => cue.text.trim().length > 0);

    // Fix timing overlaps
    for (let i = 0; i < fixedCues.length - 1; i++) {
      if (fixedCues[i].endMs > fixedCues[i + 1].startMs) {
        fixedCues[i].endMs = fixedCues[i + 1].startMs - 100; // 100ms gap
      }
    }

    // Ensure minimum duration (200ms)
    fixedCues = fixedCues.map(cue => ({
      ...cue,
      endMs: Math.max(cue.startMs + 200, cue.endMs)
    }));

    setCues(fixedCues);
  }, [cues]);

  const exportSRT = useCallback(() => {
    const srtContent = cues.map((cue, index) => {
      const startTime = formatTime(cue.startMs).replace('.', ',');
      const endTime = formatTime(cue.endMs).replace('.', ',');
      return `${index + 1}\\n${startTime.replace('.', ',')} --> ${endTime.replace('.', ',')}\\n${cue.text}\\n`;
    }).join('\\n');

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  }, [cues]);

  const exportVTT = useCallback(() => {
    const vttContent = 'WEBVTT\\n\\n' + cues.map((cue) => {
      const startTime = formatTime(cue.startMs);
      const endTime = formatTime(cue.endMs);
      return `${startTime} --> ${endTime}\\n${cue.text}\\n`;
    }).join('\\n');

    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.vtt';
    a.click();
    URL.revokeObjectURL(url);
  }, [cues]);

  const validationIssues = validateCues();

  return (
    <div className="subtitle-editor">
      <Card className="subtitle-editor__container">
        <div className="subtitle-editor__header">
          <div className="subtitle-editor__title">
            <Subtitles className="subtitle-editor__icon" />
            <h3>Subtitle Editor</h3>
            <Badge variant={validationIssues.length > 0 ? "destructive" : "secondary"}>
              {cues.length} cues
            </Badge>
          </div>

          <div className="subtitle-editor__actions">
            <Button
              variant="outline"
              size="sm"
              onClick={addCue}
              disabled={disabled}
            >
              <Plus className="subtitle-editor__btn-icon" />
              Add Cue
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={autoFixCues}
              disabled={disabled || cues.length === 0}
            >
              <RotateCcw className="subtitle-editor__btn-icon" />
              Auto Fix
            </Button>

            <div className="subtitle-editor__export-group">
              <Button
                variant="ghost"
                size="sm"
                onClick={exportSRT}
                disabled={disabled || cues.length === 0}
              >
                <Download className="subtitle-editor__btn-icon" />
                SRT
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={exportVTT}
                disabled={disabled || cues.length === 0}
              >
                <Download className="subtitle-editor__btn-icon" />
                VTT
              </Button>
            </div>
          </div>
        </div>

        {validationIssues.length > 0 && (
          <div className="subtitle-editor__validation">
            <h4>Validation Issues:</h4>
            <ul>
              {validationIssues.slice(0, 5).map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
              {validationIssues.length > 5 && (
                <li>...and {validationIssues.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        <div className="subtitle-editor__content">
          <div className="subtitle-editor__timeline">
            <div className="subtitle-editor__timeline-header">
              <span>Timeline</span>
              <span>{formatTime(totalDuration || 60000)}</span>
            </div>

            <div className="subtitle-editor__timeline-track">
              {cues.map((cue) => (
                <div
                  key={cue.id}
                  className={`subtitle-editor__timeline-cue ${selectedCueId === cue.id ? 'selected' : ''}`}
                  style={{
                    left: `${(cue.startMs / (totalDuration || 60000)) * 100}%`,
                    width: `${((cue.endMs - cue.startMs) / (totalDuration || 60000)) * 100}%`
                  }}
                  onClick={() => setSelectedCueId(cue.id)}
                >
                  <span className="subtitle-editor__timeline-cue-text">
                    {cue.text.substring(0, 20)}{cue.text.length > 20 ? '...' : ''}
                  </span>
                </div>
              ))}

              <div
                className="subtitle-editor__timeline-playhead"
                style={{ left: `${(currentTime / (totalDuration || 60000)) * 100}%` }}
              />
            </div>

            <div className="subtitle-editor__timeline-controls">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={disabled}
              >
                {isPlaying ? (
                  <Pause className="subtitle-editor__btn-icon" />
                ) : (
                  <Play className="subtitle-editor__btn-icon" />
                )}
              </Button>

              <span className="subtitle-editor__time">
                {formatTime(currentTime)}
              </span>
            </div>
          </div>

          <div className="subtitle-editor__cue-list">
            <div className="subtitle-editor__cue-list-header">
              <span>Cues</span>
              <span className="subtitle-editor__cue-list-count">{cues.length}</span>
            </div>

            <div className="subtitle-editor__cue-list-content">
              {cues.map((cue, index) => (
                <div
                  key={cue.id}
                  className={`subtitle-editor__cue-item ${selectedCueId === cue.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCueId(cue.id)}
                >
                  <div className="subtitle-editor__cue-item-header">
                    <span className="subtitle-editor__cue-item-index">#{index + 1}</span>
                    <div className="subtitle-editor__cue-item-timing">
                      <span>{formatTime(cue.startMs)}</span>
                      <span>→</span>
                      <span>{formatTime(cue.endMs)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCue(cue.id);
                      }}
                      disabled={disabled}
                    >
                      <Trash2 className="subtitle-editor__btn-icon subtitle-editor__btn-icon--danger" />
                    </Button>
                  </div>

                  <div className="subtitle-editor__cue-item-content">
                    <textarea
                      value={cue.text}
                      onChange={(e) => updateCue(cue.id, { text: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      disabled={disabled}
                      className="subtitle-editor__cue-item-text"
                      placeholder="Enter subtitle text..."
                    />
                  </div>

                  <div className="subtitle-editor__cue-item-controls">
                    <div className="subtitle-editor__cue-item-nudge">
                      <span>Start:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeCueTiming(cue.id, -100, 0);
                        }}
                        disabled={disabled}
                      >
                        <ChevronDown className="subtitle-editor__btn-icon" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeCueTiming(cue.id, 100, 0);
                        }}
                        disabled={disabled}
                      >
                        <ChevronUp className="subtitle-editor__btn-icon" />
                      </Button>
                    </div>

                    <div className="subtitle-editor__cue-item-nudge">
                      <span>End:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeCueTiming(cue.id, 0, -100);
                        }}
                        disabled={disabled}
                      >
                        <ChevronDown className="subtitle-editor__btn-icon" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeCueTiming(cue.id, 0, 100);
                        }}
                        disabled={disabled}
                      >
                        <ChevronUp className="subtitle-editor__btn-icon" />
                      </Button>
                    </div>

                    {cue.slideNumber && (
                      <Badge variant="outline" className="subtitle-editor__cue-item-slide">
                        Slide {cue.slideNumber}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}

              {cues.length === 0 && (
                <div className="subtitle-editor__empty-state">
                  <Subtitles className="subtitle-editor__empty-icon" />
                  <p>No subtitles yet</p>
                  <Button onClick={addCue} disabled={disabled}>
                    <Plus className="subtitle-editor__btn-icon" />
                    Add First Cue
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}