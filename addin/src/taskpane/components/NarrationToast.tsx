import React from "react";
import { Button } from "@ui/button";
import { CheckCircle, Activity, Music, X, Loader2 } from "lucide-react";

export interface NarrationToastProps {
  visible: boolean;
  message: string;
  onViewSummary: () => void;
  onEmbed: () => void;
  onDismiss: () => void;
  isEmbedding: boolean;
}

/**
 * Toast notification component for narration completion
 */
export function NarrationToast({
  visible,
  message,
  onViewSummary,
  onEmbed,
  onDismiss,
  isEmbedding,
}: NarrationToastProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="narration-toast" role="status" aria-live="polite">
      <div className="narration-toast__icon">
        <CheckCircle className="narration-toast__icon-graphic" />
      </div>
      <div className="narration-toast__body">
        <span className="narration-toast__title">Narration ready</span>
        <span className="narration-toast__message">{message}</span>
      </div>
      <div className="narration-toast__actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewSummary}
          className="narration-toast__action"
        >
          <Activity className="narration-toast__action-icon" />
          View summary
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onEmbed}
          disabled={isEmbedding}
          className="narration-toast__action"
        >
          {isEmbedding ? (
            <Loader2 className="narration-toast__action-icon narration-btn-icon--spin" />
          ) : (
            <Music className="narration-toast__action-icon" />
          )}
          {isEmbedding ? "Embedding…" : "Embed audio"}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="narration-toast__dismiss"
        aria-label="Dismiss narration notification"
      >
        <X className="narration-toast__dismiss-icon" />
      </Button>
    </div>
  );
}
