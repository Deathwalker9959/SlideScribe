import React from "react";
import { Button } from "@ui/button";
import { Edit, Settings, Mic, Activity } from "lucide-react";

export interface InitialViewProps {
  onNavigateToScript: () => void;
  onNavigateToSettings: () => void;
  onStartNarrationJob: () => void;
  onStartQuickNarration: () => void;
  onNavigateToProgress?: () => void;
  isStartingJob: boolean;
  isStartingQuickJob: boolean;
  progressViewEnabled?: boolean;
  activeJobId: string | null;
}

/**
 * Initial/home view for the Narration Assistant
 */
export function InitialView({
  onNavigateToScript,
  onNavigateToSettings,
  onStartNarrationJob,
  onStartQuickNarration,
  onNavigateToProgress,
  isStartingJob,
  isStartingQuickJob,
  progressViewEnabled = false,
  activeJobId,
}: InitialViewProps) {
  return (
    <div className="narration-view narration-view--initial">
      <div className="narration-icon-wrapper">
        <Edit className="narration-icon" />
      </div>
      <h2 className="narration-title">Welcome to SlideScribe</h2>
      <p className="narration-description">
        Create AI-powered narration for your PowerPoint presentations with customizable voices and
        real-time progress tracking.
      </p>

      <div className="narration-action-buttons">
        <Button onClick={onNavigateToScript} className="narration-btn-primary">
          <Edit className="narration-btn-icon" />
          Edit Narration Scripts
        </Button>

        <Button onClick={onNavigateToSettings} variant="secondary" className="narration-btn-secondary">
          <Settings className="narration-btn-icon" />
          Voice Settings
        </Button>
      </div>

      <div className="narration-quick-actions">
        <h3 className="narration-subtitle">Quick Actions</h3>
        <Button
          onClick={onStartNarrationJob}
          className="narration-btn-generate"
          disabled={isStartingJob}
        >
          <Mic className="narration-btn-icon" />
          {isStartingJob ? "Starting..." : "Generate Narration"}
        </Button>
        <Button
          onClick={onStartQuickNarration}
          className="narration-btn-secondary"
          variant="secondary"
          disabled={isStartingQuickJob}
        >
          <Mic className="narration-btn-icon" />
          {isStartingQuickJob ? "Starting..." : "Generate Current Slide"}
        </Button>

        {progressViewEnabled && activeJobId && onNavigateToProgress && (
          <Button
            onClick={onNavigateToProgress}
            variant="ghost"
            className="narration-btn-view-progress"
          >
            <Activity className="narration-btn-icon" />
            View Progress
          </Button>
        )}
      </div>
    </div>
  );
}
