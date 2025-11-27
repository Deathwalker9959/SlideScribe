import React from "react";
import { EnhancedAuthPanel } from "@components/EnhancedAuthPanel";

export interface LoginViewProps {
  isDevelopment: boolean;
  onDevelopmentModeChange: (enabled: boolean) => void;
  onAuthChange: (isAuthenticated: boolean, user?: any, sessionId?: string) => void;
}

/**
 * Login view component for SlideScribe authentication
 */
export function LoginView({
  isDevelopment,
  onDevelopmentModeChange,
  onAuthChange,
}: LoginViewProps) {
  return (
    <div className="narration-view narration-view--login">
      <div className="narration-login-header">
        <h1 className="narration-main-title">SlideScribe</h1>
        <p className="narration-login-subtitle">AI-Powered Narration for PowerPoint</p>
      </div>

      <div className="narration-login-content">
        <EnhancedAuthPanel
          onAuthChange={onAuthChange}
          className=""
          autoStart={true}
        />
      </div>

      <div className="narration-login-footer">
        <div className="narration-login-dev-toggle">
          <label className="narration-toolbar-checkbox">
            <input
              type="checkbox"
              checked={isDevelopment}
              onChange={(event) => onDevelopmentModeChange(event.target.checked)}
            />
            <span>Development Mode</span>
          </label>
        </div>
      </div>
    </div>
  );
}
