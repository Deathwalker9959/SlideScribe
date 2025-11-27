import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  name?: string;
  email?: string;
  [key: string]: any;
}

export interface UseAuthReturn {
  isAuthenticated: boolean;
  authUser: AuthUser | null;
  sessionId: string | null;
  isDevelopment: boolean;
  setIsDevelopment: (value: boolean) => void;
  handleLogin: (isAuthenticated: boolean, user?: AuthUser, sessionId?: string) => void;
  handleLogout: () => void;
}

/**
 * Custom hook for authentication state and logic
 */
export function useAuth(
  onViewChange?: (view: string) => void,
  onStatusMessage?: (message: string | null) => void
): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDevelopment, setIsDevelopment] = useState(false);

  // Initialize authentication status and development mode
  useEffect(() => {
    // Check if we're in development mode
    if (typeof window !== "undefined") {
      const hostname = window.location?.hostname || "";
      setIsDevelopment(
        hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("dev")
      );
    }

    // For now, start in login state
    // In the future, we could check for stored tokens here
    setIsAuthenticated(false);
  }, []);

  /**
   * Handle authentication state change (login/logout)
   */
  const handleLogin = useCallback(
    (isAuthenticated: boolean, user?: AuthUser, sessionId?: string) => {
      setIsAuthenticated(isAuthenticated);
      setAuthUser(user || null);
      setSessionId(sessionId || null);

      if (isAuthenticated) {
        onViewChange?.("initial");
        onStatusMessage?.("Successfully logged in");
        // Auto-dismiss success message after 3 seconds
        setTimeout(() => onStatusMessage?.(null), 3000);
      } else {
        onViewChange?.("login");
        onStatusMessage?.("Logged out");
        // Auto-dismiss logout message after 2 seconds
        setTimeout(() => onStatusMessage?.(null), 2000);
      }
    },
    [onViewChange, onStatusMessage]
  );

  /**
   * Handle logout
   */
  const handleLogout = useCallback(() => {
    handleLogin(false, undefined, undefined);
  }, [handleLogin]);

  return {
    isAuthenticated,
    authUser,
    sessionId,
    isDevelopment,
    setIsDevelopment,
    handleLogin,
    handleLogout,
  };
}
