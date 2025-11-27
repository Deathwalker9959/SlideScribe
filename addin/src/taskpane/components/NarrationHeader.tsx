import React from "react";
import { Button } from "@ui/button";
import { ArrowLeft, Activity, User, ChevronDown, LogOut, Bug } from "lucide-react";
import type { VoiceSettingsValue } from "@components/VoiceSettings";

export interface NarrationHeaderProps {
  isAuthenticated: boolean;
  currentView: string;
  viewHistory: any[];
  onNavigateBack: () => void;
  onNavigateToView: (view: string) => void;

  // Voice settings
  voiceSettings: VoiceSettingsValue;
  onVoiceSettingsChange: (settings: VoiceSettingsValue) => void;
  onStatusMessage: (message: string | null) => void;
  languageOptions: Array<{ code: string; name: string }>;

  // Progress
  progressViewEnabled?: boolean;
  activeJobId: string | null;

  // Profile
  showProfileDropdown: boolean;
  onToggleProfileDropdown: () => void;
  authUser: { name?: string; email?: string } | null;
  onLogout: () => void;

  // Debug
  isDevelopment: boolean;
}

/**
 * Main header component with navigation, language selector, and profile dropdown
 */
export function NarrationHeader({
  isAuthenticated,
  currentView,
  viewHistory,
  onNavigateBack,
  onNavigateToView,
  voiceSettings,
  onVoiceSettingsChange,
  onStatusMessage,
  languageOptions,
  progressViewEnabled = false,
  activeJobId,
  showProfileDropdown,
  onToggleProfileDropdown,
  authUser,
  onLogout,
  isDevelopment,
}: NarrationHeaderProps) {
  return (
    <div className="narration-header-main">
      {/* Left side - back button */}
      <div className="narration-header-left">
        {isAuthenticated && currentView !== "login" && (
          (viewHistory.length > 0 || currentView !== "initial") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateBack}
              className="narration-back-btn-header"
              title="Go back"
              aria-label="Navigate to previous page"
            >
              <ArrowLeft className="narration-btn-icon" />
            </Button>
          )
        )}
      </div>

      {/* Center - title */}
      <h1 className="narration-main-title">SlideScribe</h1>

      {/* Right side - progress, profile, debug (language selector moved to settings) */}
      <div className="narration-header-right">
        {progressViewEnabled && isAuthenticated && activeJobId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToView(currentView === "progress" ? "initial" : "progress")}
            className="narration-progress-toggle"
            title="View narration progress"
            aria-label="Toggle progress view"
            aria-pressed={currentView === "progress"}
          >
            <Activity className="narration-btn-icon" />
          </Button>
        )}
        {isAuthenticated && currentView !== "login" && (
          <div className="narration-profile-dropdown">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleProfileDropdown}
              className="narration-profile-toggle"
              title="User profile and settings"
              aria-label="Toggle user profile menu"
              aria-expanded={showProfileDropdown}
            >
              <User className="narration-btn-icon" />
              <ChevronDown className="narration-btn-icon narration-chevron-icon" />
            </Button>
            {showProfileDropdown && (
              <div className="narration-profile-menu">
                <div className="narration-profile-menu-header">
                  <User className="narration-profile-icon" />
                  <div className="narration-profile-info">
                    <span className="narration-profile-name">{authUser?.name || "User"}</span>
                    <span className="narration-profile-email">
                      {authUser?.email || "user@example.com"}
                    </span>
                  </div>
                </div>
                <div className="narration-profile-menu-divider"></div>
                <button
                  onClick={onLogout}
                  className="narration-profile-menu-item narration-profile-menu-item--logout"
                >
                  <LogOut className="narration-profile-menu-icon" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        )}
        {isDevelopment && isAuthenticated && currentView !== "login" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToView(currentView === "debug" ? "initial" : "debug")}
            className="narration-debug-toggle"
            title="Toggle Debug Panel (Development Mode)"
            aria-label="Toggle debug panel"
            aria-pressed={currentView === "debug"}
          >
            <Bug className="narration-btn-icon" />
          </Button>
        )}
      </div>
    </div>
  );
}
