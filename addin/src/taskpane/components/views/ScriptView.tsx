import React from "react";
import { Button } from "@ui/button";
import { Settings, Activity, Mic, RefreshCw, Loader2 } from "lucide-react";
import { ScriptEditor, SlideScript, SlideAudioExport } from "@components/ScriptEditor";

export interface ScriptViewProps {
  // Toolbar state
  includeImages: boolean;
  onIncludeImagesChange: (enabled: boolean) => void;
  activeJobId: string | null;
  isRefreshingContext: boolean;
  onRefreshContext: (jobId: string, options: { force: boolean; showStatus: boolean }) => void;
  progressViewEnabled?: boolean;

  // Navigation
  onNavigateToSettings: () => void;
  onNavigateToProgress?: () => void;

  // Job actions
  onStartNarrationJob: () => void;
  isStartingJob: boolean;

  // ScriptEditor props
  slideScripts: SlideScript[];
  jobAudioExports: SlideAudioExport[];
  onUpdateSlide: (slide: SlideScript) => void;
  onPreviewSlide: (slide: SlideScript) => Promise<void>;
  onRefineSlide: (slide: SlideScript) => Promise<void>;
  previewingSlideId: string | null;
  refiningSlideId: string | null;
  onAddImage: (slideId: string, attachment: any) => void;
  onRemoveImage: (slideId: string, attachmentId: string) => void;
  onEmbedNarration: () => Promise<void>;
  embeddingNarration: boolean;
  jobInProgress: boolean;
  jobCurrentSlide?: number | null;
  isStartingQuickJob: boolean;
}

/**
 * Script editing view with ScriptEditor and toolbar controls
 */
export function ScriptView({
  includeImages,
  onIncludeImagesChange,
  activeJobId,
  isRefreshingContext,
  onRefreshContext,
  progressViewEnabled = false,
  onNavigateToSettings,
  onNavigateToProgress,
  onStartNarrationJob,
  isStartingJob,
  slideScripts,
  jobAudioExports,
  onUpdateSlide,
  onPreviewSlide,
  onRefineSlide,
  previewingSlideId,
  refiningSlideId,
  onAddImage,
  onRemoveImage,
  onEmbedNarration,
  embeddingNarration,
  jobInProgress,
  jobCurrentSlide,
  isStartingQuickJob,
}: ScriptViewProps) {
  return (
    <div className="narration-view narration-view--script">
      <div className="narration-script-toolbar">
        <div className="narration-script-toolbar__group">
          <label className="narration-toolbar-checkbox">
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(event) => onIncludeImagesChange(event.target.checked)}
            />
            <span>Include images</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              activeJobId && onRefreshContext(activeJobId, { force: true, showStatus: true })
            }
            disabled={!activeJobId || isRefreshingContext}
          >
            {isRefreshingContext ? (
              <Loader2 className="narration-btn-icon narration-btn-icon--spin" />
            ) : (
              <RefreshCw className="narration-btn-icon" />
            )}
            {isRefreshingContext ? "Refreshing..." : "Refresh Context"}
          </Button>
        </div>
        <div className="narration-script-toolbar__group narration-script-toolbar__group--primary">
          <Button variant="ghost" size="sm" onClick={onNavigateToSettings}>
            <Settings className="narration-btn-icon" />
            Voice Settings
          </Button>
          {progressViewEnabled && onNavigateToProgress && (
            <Button variant="ghost" size="sm" onClick={onNavigateToProgress}>
              <Activity className="narration-btn-icon" />
              View Progress
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onStartNarrationJob} disabled={isStartingJob}>
            <Mic className="narration-btn-icon" />
            {isStartingJob ? "Starting..." : "Start Narration"}
          </Button>
        </div>
      </div>
      <ScriptEditor
        slides={slideScripts}
        audioExports={jobAudioExports}
        onUpdateSlide={onUpdateSlide}
        onPreview={onPreviewSlide}
        onRefine={onRefineSlide}
        previewingSlideId={previewingSlideId}
        refiningSlideId={refiningSlideId}
        onAddImage={onAddImage}
        onRemoveImage={onRemoveImage}
        onEmbedNarration={onEmbedNarration}
        embeddingNarration={embeddingNarration}
        jobInProgress={jobInProgress}
        jobCurrentSlide={jobCurrentSlide}
      />
    </div>
  );
}
