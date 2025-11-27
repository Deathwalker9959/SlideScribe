import React from "react";
import type { ProgressSnapshot } from "@components/ProgressPanel";

export interface NarrationStatusBarProps {
  progressViewEnabled?: boolean;
  activeJobId: string | null;
  latestProgress: ProgressSnapshot | null;
  lastError: string | null;
  statusMessage: string | null;
}

/**
 * Status bar component showing job summary, errors, and status messages
 */
export function NarrationStatusBar({
  progressViewEnabled = false,
  activeJobId,
  latestProgress,
  lastError,
  statusMessage,
}: NarrationStatusBarProps) {
  return (
    <>
      {progressViewEnabled && activeJobId && latestProgress && (
        <div className="narration-job-summary">
          <div className="narration-job-summary__row">
            <span className="narration-job-summary__label">Tracking job</span>
            <span className="narration-job-summary__value">{activeJobId}</span>
          </div>
          <div className="narration-job-summary__stats">
            <span>Status: {latestProgress.status}</span>
            <span>
              Slide {latestProgress.currentSlide}/{latestProgress.totalSlides}
            </span>
            <span>{Math.round((latestProgress.progress ?? 0) * 100)}%</span>
          </div>
        </div>
      )}
      {lastError && (
        <div className="narration-job-alert" role="alert">
          {lastError}
        </div>
      )}
      {statusMessage && !lastError && (
        <div className="narration-job-info" role="status">
          {statusMessage}
        </div>
      )}
    </>
  );
}
