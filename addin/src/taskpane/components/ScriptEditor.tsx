import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import { ScrollArea } from "@ui/scroll-area";
import { Card } from "@ui/card";
import { Badge } from "@ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Play, Wand2, Save, Loader2, Music, Download } from "lucide-react";

const MAX_CHARACTERS = 1200;
const WORDS_PER_MINUTE = 160;

export interface SlideAudioTimelineEntry {
  slideId: string;
  start: number;
  end: number;
  duration: number;
  sourcePath?: string;
  volume?: number | null;
  backgroundTrackPath?: string | null;
}

export interface SlideAudioExport {
  format: string;
  path: string;
  fileSize?: number;
  createdAt?: string;
  downloadUrl?: string;
  resolvedUrl?: string;
}

export interface SlideScript {
  slideId: string;
  slideNumber: number;
  originalText: string;
  refinedScript: string;
  duration: number; // seconds
  wordCount: number;
  updatedAt?: string;
  contextualHighlights?: string[];
  contextualCallouts?: string[];
  imageReferences?: string[];
  contextualTransitions?: Record<string, string>;
  contextConfidence?: number | null;
  contextualUpdatedAt?: string;
  imageAttachments?: SlideImageAttachment[];
  audioTimeline?: SlideAudioTimelineEntry[];
  audioExports?: SlideAudioExport[];
  audioMixPath?: string | null;
  audioPeakDb?: number | null;
  audioLoudnessDb?: number | null;
  audioBackgroundTrack?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
}

export interface SlideImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

export type RefinementMode = "style" | "clarity" | "tone";

interface ScriptEditorProps {
  slides: SlideScript[];
  audioExports?: SlideAudioExport[];
  onUpdateSlide: (slide: SlideScript) => void;
  onPreview: (slide: SlideScript) => Promise<void> | void;
  onRefine: (slide: SlideScript, mode: RefinementMode) => Promise<void> | void;
  previewingSlideId?: string | null;
  refiningSlideId?: string | null;
  onAddImage?: (slideId: string, file: File) => Promise<void> | void;
  onRemoveImage?: (slideId: string, attachmentId: string) => void;
  onEmbedNarration?: () => Promise<void> | void;
  embeddingNarration?: boolean;
}

const REFINEMENT_OPTIONS: { label: string; value: RefinementMode }[] = [
  { label: "Style Polish", value: "style" },
  { label: "Clarity Boost", value: "clarity" },
  { label: "Tone Adjust", value: "tone" },
];

export function ScriptEditor({
  slides,
  audioExports,
  onUpdateSlide,
  onPreview,
  onRefine,
  previewingSlideId,
  refiningSlideId,
  onAddImage,
  onRemoveImage,
  onEmbedNarration,
  embeddingNarration,
}: ScriptEditorProps) {
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(slides[0]?.slideId ?? null);
  const [refinementMode, setRefinementMode] = useState<RefinementMode>("style");

  useEffect(() => {
    if (!selectedSlideId && slides.length > 0) {
      setSelectedSlideId(slides[0].slideId);
      return;
    }

    const exists = slides.some((slide) => slide.slideId === selectedSlideId);
    if (!exists && slides.length > 0) {
      setSelectedSlideId(slides[0].slideId);
    }
  }, [slides, selectedSlideId]);

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.slideId === selectedSlideId) ?? slides[0] ?? null,
    [slides, selectedSlideId]
  );

  const handleScriptChange = (value: string) => {
    if (!selectedSlide) return;

    const trimmed = value.trim();
    const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
    const durationSeconds =
      wordCount === 0 ? 0 : Math.max(5, Math.round((wordCount / WORDS_PER_MINUTE) * 60));

    onUpdateSlide({
      ...selectedSlide,
      refinedScript: value,
      wordCount,
      duration: durationSeconds,
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePreviewClick = () => {
    if (!selectedSlide) return;
    onPreview(selectedSlide);
  };

  const handleRefineClick = () => {
    if (!selectedSlide) return;
    onRefine(selectedSlide, refinementMode);
  };

  if (!selectedSlide) {
    return (
      <div className="script-editor script-editor--empty">
        <p>No slides available. Create a narration script to begin editing.</p>
      </div>
    );
  }

  const characterCount = selectedSlide.refinedScript.length;
  const exceedsLimit = characterCount > MAX_CHARACTERS;
  const isPreviewing = previewingSlideId === selectedSlide.slideId;
  const isRefining = refiningSlideId === selectedSlide.slideId;
  const hasContextualInsights =
    (selectedSlide.contextualHighlights && selectedSlide.contextualHighlights.length > 0) ||
    (selectedSlide.contextualCallouts && selectedSlide.contextualCallouts.length > 0) ||
    (selectedSlide.imageReferences && selectedSlide.imageReferences.length > 0) ||
    (selectedSlide.contextualTransitions &&
      Object.keys(selectedSlide.contextualTransitions).length > 0) ||
    (selectedSlide.audioTimeline && selectedSlide.audioTimeline.length > 0) ||
    (selectedSlide.audioExports && selectedSlide.audioExports.length > 0);

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedSlide || !event.target.files || event.target.files.length === 0) {
      return;
    }
    const file = event.target.files[0];
    if (onAddImage) {
      onAddImage(selectedSlide.slideId, file);
    }
    event.target.value = "";
  };

  return (
    <div className="script-editor">
      <div className="script-editor__sidebar">
        <ScrollArea className="script-editor__scroll">
          <ul className="script-editor__list">
            {slides.map((slide) => {
              const active = slide.slideId === selectedSlide.slideId;
              return (
                <li key={slide.slideId}>
                  <button
                    type="button"
                    className={`script-editor__list-item ${active ? "script-editor__list-item--active" : ""}`}
                    onClick={() => setSelectedSlideId(slide.slideId)}
                  >
                    <div className="script-editor__list-header">
                      <span>Slide {slide.slideNumber}</span>
                      <Badge variant="secondary">{slide.wordCount} words</Badge>
                    </div>
                    <p className="script-editor__list-preview">
                      {(slide.refinedScript || slide.originalText).slice(0, 80) || "No script yet"}
                    </p>
                    <div className="script-editor__list-meta">
                      <span>{slide.duration}s</span>
                      {slide.updatedAt && (
                        <span>Updated {new Date(slide.updatedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>

      <div className="script-editor__content">
        <div className="script-editor__content-header">
          <div>
            <h3>Slide {selectedSlide.slideNumber}</h3>
            <p className="script-editor__original">
              {selectedSlide.originalText || "No original text provided."}
            </p>
          </div>
          <div className="script-editor__actions">
            <Select
              value={refinementMode}
              onValueChange={(value) => setRefinementMode(value as RefinementMode)}
            >
              <SelectTrigger className="script-editor__select">
                <SelectValue placeholder="Refinement" />
              </SelectTrigger>
              <SelectContent>
                {REFINEMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handlePreviewClick}
              disabled={isPreviewing}
              className="script-editor__action-btn"
            >
              {isPreviewing ? (
                <Loader2 className="script-editor__btn-icon script-editor__btn-icon--spin" />
              ) : (
                <Play className="script-editor__btn-icon" />
              )}
              Preview voice
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRefineClick}
              disabled={isRefining}
              className="script-editor__action-btn"
            >
              {isRefining ? (
                <Loader2 className="script-editor__btn-icon script-editor__btn-icon--spin" />
              ) : (
                <Wand2 className="script-editor__btn-icon" />
              )}
              Refine this slide
            </Button>
          </div>
        </div>

        <Card className="script-editor__editor-card">
          <Textarea
            value={selectedSlide.refinedScript}
            onChange={(event) => handleScriptChange(event.target.value)}
            className={`script-editor__textarea ${exceedsLimit ? "script-editor__textarea--limit" : ""}`}
            placeholder="Write or refine the narration for this slide..."
            rows={12}
          />
          <div className="script-editor__meta">
            <div>
              <span>Word count: {selectedSlide.wordCount}</span>
              <span>Estimated duration: {selectedSlide.duration}s</span>
            </div>
            <div
              className={`script-editor__char-count ${exceedsLimit ? "script-editor__char-count--warning" : ""}`}
            >
              <span>{characterCount} characters</span>
              <span>Limit: {MAX_CHARACTERS}</span>
            </div>
          </div>
        </Card>

        <Card className="script-editor__context-card">
          <div className="script-editor__context-header">
            <div>
              <h4 className="script-editor__context-title">Contextual Insights</h4>
              <p className="script-editor__context-subtitle">
                Highlights and visual cues generated by the narration pipeline.
              </p>
            </div>
            <div className="script-editor__context-meta">
              {typeof selectedSlide.contextConfidence === "number" && (
                <Badge variant="secondary" className="script-editor__confidence-badge">
                  Confidence {Math.round(selectedSlide.contextConfidence * 100)}%
                </Badge>
              )}
              {selectedSlide.contextualUpdatedAt && (
                <span className="script-editor__context-updated">
                  Updated{" "}
                  {new Date(selectedSlide.contextualUpdatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
          {hasContextualInsights ? (
            <div className="script-editor__context-sections">
              {selectedSlide.contextualHighlights &&
                selectedSlide.contextualHighlights.length > 0 && (
                  <div className="script-editor__context-section">
                    <h5>Key Highlights</h5>
                    <ul className="script-editor__context-list">
                      {selectedSlide.contextualHighlights.map((highlight, index) => (
                        <li key={`highlight-${index}`}>{highlight}</li>
                      ))}
                    </ul>
                  </div>
                )}
              {selectedSlide.contextualCallouts && selectedSlide.contextualCallouts.length > 0 && (
                <div className="script-editor__context-section">
                  <h5>Narration Callouts</h5>
                  <ul className="script-editor__context-list">
                    {selectedSlide.contextualCallouts.map((callout, index) => (
                      <li key={`callout-${index}`}>{callout}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedSlide.imageReferences && selectedSlide.imageReferences.length > 0 && (
                <div className="script-editor__context-section">
                  <h5>Visual References</h5>
                  <ul className="script-editor__context-list">
                    {selectedSlide.imageReferences.map((reference, index) => (
                      <li key={`image-ref-${index}`}>{reference}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedSlide.audioTimeline && selectedSlide.audioTimeline.length > 0 && (
                <div className="script-editor__context-section script-editor__context-section--audio">
                  <h5>
                    <Music className="script-editor__context-icon" />
                    Audio Timeline
                  </h5>
                  <ul className="script-editor__context-list">
                    {selectedSlide.audioTimeline.map((entry, index) => (
                      <li key={`audio-timeline-${entry.slideId}-${index}`}>
                        <span className="script-editor__context-label">Start:</span>{" "}
                        {entry.start.toFixed(1)}s ·
                        <span className="script-editor__context-label"> Duration:</span>{" "}
                        {entry.duration.toFixed(1)}s
                        {Number.isFinite(entry.end) && ` · Ends at ${entry.end.toFixed(1)}s`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedSlide.audioExports && selectedSlide.audioExports.length > 0 && (
                <div className="script-editor__context-section script-editor__context-section--audio">
                  <h5>
                    <Download className="script-editor__context-icon" />
                    Available Mixes
                  </h5>
                  <ul className="script-editor__context-list">
                    {selectedSlide.audioExports.map((exportInfo, index) => (
                      <li key={`audio-export-${exportInfo.format}-${index}`}>
                        <span className="script-editor__context-label">
                          {exportInfo.format.toUpperCase()}:
                        </span>{" "}
                        {exportInfo.resolvedUrl ? (
                          <a
                            href={exportInfo.resolvedUrl}
                            className="script-editor__link"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {exportInfo.fileSize
                              ? `${(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB`
                              : "Download"}
                          </a>
                        ) : (
                          <span>
                            {exportInfo.fileSize
                              ? `${(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB`
                              : "Ready"}
                          </span>
                        )}
                        {exportInfo.createdAt && (
                          <span className="script-editor__context-meta">
                            {" · "}
                            {new Date(exportInfo.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedSlide.contextualTransitions &&
                Object.keys(selectedSlide.contextualTransitions).length > 0 && (
                  <div className="script-editor__context-section">
                    <h5>Context Cues</h5>
                    <ul className="script-editor__context-list">
                      {Object.entries(selectedSlide.contextualTransitions).map(([key, value]) => (
                        <li key={`transition-${key}`}>
                          <span className="script-editor__context-label">
                            {key.replace(/_/g, " ")}:
                          </span>{" "}
                          {value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <div className="script-editor__context-empty">
              <p>
                No contextual insights yet. Run slide processing to populate highlights and visual
                cues.
              </p>
            </div>
          )}
        </Card>

        <Card className="script-editor__images-card">
          <div className="script-editor__images-header">
            <h4 className="script-editor__images-title">Slide Images</h4>
            <p className="script-editor__images-subtitle">
              Attach slide visuals to improve image analysis results.
            </p>
          </div>
          <div className="script-editor__images-actions">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelection}
              disabled={!onAddImage}
            />
          </div>
          <div className="script-editor__images-list">
            {(selectedSlide.imageAttachments ?? []).length === 0 ? (
              <p className="script-editor__images-empty">No images attached yet.</p>
            ) : (
              (selectedSlide.imageAttachments ?? []).map((attachment) => (
                <div key={attachment.id} className="script-editor__images-item">
                  <div>
                    <strong>{attachment.name}</strong>
                    <span>{Math.round(attachment.size / 1024)} KB</span>
                  </div>
                  <div className="script-editor__images-item-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveImage?.(selectedSlide.slideId, attachment.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {audioExports && audioExports.length > 0 && (
          <Card className="script-editor__exports-card">
            <div className="script-editor__images-header">
              <h4 className="script-editor__images-title">
                <Download className="script-editor__images-icon" />
                Job Audio Mixes
              </h4>
              <p className="script-editor__images-subtitle">
                Download combined narration mixes generated for this job.
              </p>
            </div>
            <ul className="script-editor__exports-list">
              {audioExports.map((exportInfo, index) => (
                <li key={`job-audio-export-${exportInfo.format}-${index}`}>
                  <span className="script-editor__exports-format">
                    {exportInfo.format.toUpperCase()}
                  </span>
                  {exportInfo.resolvedUrl ? (
                    <a
                      href={exportInfo.resolvedUrl}
                      className="script-editor__exports-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {exportInfo.fileSize
                        ? `${(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB`
                        : "Download"}
                    </a>
                  ) : exportInfo.fileSize ? (
                    <span className="script-editor__exports-size">
                      {(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  ) : (
                    <span className="script-editor__exports-size">Pending</span>
                  )}
                  {exportInfo.createdAt && (
                    <span className="script-editor__exports-created">
                      {new Date(exportInfo.createdAt).toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {onEmbedNarration && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onEmbedNarration}
                disabled={embeddingNarration}
                className="script-editor__action-btn"
              >
                {embeddingNarration ? (
                  <Loader2 className="script-editor__btn-icon script-editor__btn-icon--spin" />
                ) : (
                  <Music className="script-editor__btn-icon" />
                )}
                {embeddingNarration ? "Embedding…" : "Embed narration in slides"}
              </Button>
            )}
          </Card>
        )}

        <div className="script-editor__footer">
          <div className="script-editor__autosave">
            <Save className="script-editor__btn-icon" /> Auto-saved locally
          </div>
        </div>
      </div>
    </div>
  );
}
