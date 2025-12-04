/* global PowerPoint */

import React, { useState, useEffect } from "react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Alert, AlertDescription } from "@ui/alert";
import {
  Loader2,
  LogIn,
  User,
  Shield,
  ShieldCheck,
  LogOut,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { apiClient, LoginRequest, LoginResponse } from "@utils/apiClient";

// CSS styles for animations and inputs - defined as a constant to avoid recreation on every render
const getComponentStyles = () => `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .ui-input {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    min-height: 44px;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .ui-input:focus {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    outline: none;
  }

  @supports (-webkit-touch-callout: none) {
    .ui-input {
      font-size: 16px;
    }
  }

  @media (prefers-contrast: high) {
    .ui-input {
      border-width: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  .ui-input:focus-visible,
  button:focus-visible {
    outline: 2px solid;
    outline-offset: 2px;
  }
`;

interface AuthConfig {
  auth_driver: string;
  requires_auth: boolean;
  supports_registration: boolean;
  session_expire_minutes: number;
  anonymous_session_expire_minutes: number;
}

// Tab type for auth forms
type AuthTab = "login" | "register";

interface AuthUser {
  id: string;
  username: string;
  email?: string;
  full_name?: string;
  session_id: string;
  auth_driver: string;
  is_authenticated: boolean;
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

interface EnhancedAuthPanelProps {
  onAuthChange?: (isAuthenticated: boolean, user?: AuthUser, sessionId?: string) => void;
  className?: string;
  autoStart?: boolean;
}

// Enhanced theme colors with flat design
interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryHover: string;
  inputBackground: string;
  inputBorder: string;
  inputBorderFocus: string;
  error: string;
  success: string;
  shadow: string;
}

// Enhanced PowerPoint theme detection with better system preference handling
const getPowerPointTheme = (): ThemeColors => {
  // Check if we're in a dark theme by examining document styles
  const isDark = () => {
    if (typeof document === "undefined") return false;

    // First check for PowerPoint-specific theme indicators
    const officeBody = document.querySelector("body, .office-body");
    if (officeBody) {
      const computedStyle = window.getComputedStyle(officeBody);
      const bgColor = computedStyle.backgroundColor;
      const color = computedStyle.color;

      // Analyze background color
      if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
        const rgb = bgColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]);
          const g = parseInt(rgb[1]);
          const b = parseInt(rgb[2]);
          // Calculate luminance using standard formula
          const luminance = r * 0.299 + g * 0.587 + b * 0.114;
          if (luminance < 128) return true;
        }
      }

      // Analyze text color for contrast clues
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        const rgb = color.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]);
          const g = parseInt(rgb[1]);
          const b = parseInt(rgb[2]);
          // If text color is bright, background is likely dark
          const luminance = r * 0.299 + g * 0.587 + b * 0.114;
          if (luminance > 186) return true;
        }
      }
    }

    // Check for Office theme meta tags or data attributes
    const officeTheme = document.querySelector("[data-office-theme], [data-theme]");
    if (officeTheme) {
      const theme =
        officeTheme.getAttribute("data-office-theme") || officeTheme.getAttribute("data-theme");
      if (theme && theme.toLowerCase().includes("dark")) return true;
    }

    // Check for system preference with fallback
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      return darkModeQuery.matches;
    }

    // Final fallback: check for dark indicators in the page
    const hasDarkIndicators =
      document.body.classList.contains("dark") ||
      document.body.classList.contains("theme-dark") ||
      document.documentElement.classList.contains("dark");

    return hasDarkIndicators;
  };

  const darkMode = isDark();

  return {
    background: darkMode ? "#2D2D30" : "#FFFFFF",
    surface: darkMode ? "#3E3E42" : "#F8F9FA",
    border: darkMode ? "#4D4D50" : "#DEE2E6",
    text: darkMode ? "#FFFFFF" : "#212529",
    textSecondary: darkMode ? "#B3B3B3" : "#6C757D",
    primary: darkMode ? "#4080FF" : "#0066CC",
    primaryHover: darkMode ? "#5A9CFF" : "#0052A3",
    inputBackground: darkMode ? "#404040" : "#FFFFFF",
    inputBorder: darkMode ? "#606060" : "#CED4DA",
    inputBorderFocus: darkMode ? "#70A0FF" : "#0066CC",
    error: "#DC3545",
    success: "#28A745",
    shadow: darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)",
  };
};

export function EnhancedAuthPanel({
  onAuthChange,
  className,
  autoStart = false,
}: EnhancedAuthPanelProps) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AuthTab | "anonymous">("login");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [theme, setTheme] = useState<ThemeColors>(getPowerPointTheme());

  // Update theme when system preferences change
  useEffect(() => {
    const updateTheme = () => {
      setTheme(getPowerPointTheme());
    };

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (mediaQuery.addListener) {
      mediaQuery.addListener(updateTheme);
    } else {
      mediaQuery.addEventListener("change", updateTheme);
    }

    // Initial theme detection
    updateTheme();

    return () => {
      if (mediaQuery.removeListener) {
        mediaQuery.removeListener(updateTheme);
      } else {
        mediaQuery.removeEventListener("change", updateTheme);
      }
    };
  }, []);

  // Inject component styles into document head to replace <style jsx>
  useEffect(() => {
    if (typeof document !== "undefined") {
      const styleId = "enhanced-auth-panel-styles";
      let styleElement = document.getElementById(styleId) as HTMLStyleElement;

      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        styleElement.type = "text/css";
        document.head.appendChild(styleElement);
      }

      styleElement.textContent = getComponentStyles();

      return () => {
        if (styleElement && styleElement.parentNode) {
          styleElement.parentNode.removeChild(styleElement);
        }
      };
    }
  }, []);

  // Handle view transitions with smooth animations
  const handleViewChange = (newView: AuthTab | "anonymous") => {
    if (newView !== currentView && !isTransitioning) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentView(newView);
        setIsTransitioning(false);
      }, 150);
    }
  };

  // Form states
  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState<RegisterRequest>({
    username: "",
    email: "",
    password: "",
    full_name: "",
  });

  const [anonymousUsername, setAnonymousUsername] = useState("");

  // Load auth config on mount
  useEffect(() => {
    loadAuthConfig();
  }, []);

  // Auto-start anonymous session if enabled
  useEffect(() => {
    if (autoStart && authConfig && !authConfig.requires_auth) {
      createAnonymousSession();
    } else if (authConfig && !authConfig.requires_auth) {
      // Resume existing anonymous session if token exists
      const storedSession =
        (typeof window !== "undefined" && window.localStorage.getItem("slidescribe_session_id")) ||
        (typeof window !== "undefined" && window.sessionStorage.getItem("slidescribe_session_id"));
      const storedToken =
        (typeof window !== "undefined" && window.localStorage.getItem("slidescribe_auth_token")) ||
        (typeof window !== "undefined" && window.sessionStorage.getItem("slidescribe_auth_token"));
      if (storedSession || storedToken) {
        const authUser: AuthUser = {
          id: storedSession || "anonymous",
          username: storedSession ? `anon-${storedSession.slice(0, 6)}` : "anonymous",
          session_id: storedSession || "anonymous",
          auth_driver: authConfig.auth_driver || "none",
          is_authenticated: false,
        };
        setCurrentUser(authUser);
        onAuthChange?.(true, authUser, authUser.session_id);
      }
    }
  }, [autoStart, authConfig]);

  const loadAuthConfig = async () => {
    try {
      setIsLoading(true);
      const config = await apiClient.getAuthConfig();
      setAuthConfig(config);
    } catch (error) {
      console.error("Failed to load auth config:", error);
      setError("Failed to load authentication configuration");
      // Fallback to database auth
      setAuthConfig({
        auth_driver: "database",
        requires_auth: true,
        supports_registration: true,
        session_expire_minutes: 1440,
        anonymous_session_expire_minutes: 480,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkAuthStatus = async () => {
    try {
      // Only check auth status if we have a valid stored token
      if (apiClient.isAuthenticated()) {
        const user = await apiClient.getCurrentUser();
        // Map user data to AuthUser format
        const authUser: AuthUser = {
          id: user.id || user.username,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          session_id: user.session_id || "unknown",
          auth_driver: authConfig?.auth_driver || "database",
          is_authenticated: true,
        };
        setCurrentUser(authUser);
        onAuthChange?.(true, authUser, authUser.session_id);
      }
    } catch (error) {
      // Silently handle expected 401 errors when no token exists
      if (error instanceof Error && error.message.includes("401")) {
        console.log("No authentication token found - user not authenticated");
      } else {
        console.log("Authentication check failed:", error);
      }
      setCurrentUser(null);
      onAuthChange?.(false);
    }
  };

  // Only check auth status once on component mount and only if we have a stored token
  useEffect(() => {
    if (authConfig && apiClient.isAuthenticated()) {
      checkAuthStatus();
    }
  }, []); // Empty dependency array - only run once on mount

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const data: LoginResponse = await apiClient.login(loginForm);

      const authUser: AuthUser = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        full_name: data.user.full_name,
        session_id: data.session_id,
        auth_driver: data.auth_driver,
        is_authenticated: true,
      };

      setCurrentUser(authUser);
      setLoginForm({ username: "", password: "" });
      onAuthChange?.(true, authUser, data.session_id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const data: LoginResponse = await apiClient.register(registerForm);

      const authUser: AuthUser = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        full_name: data.user.full_name,
        session_id: data.session_id,
        auth_driver: data.auth_driver,
        is_authenticated: true,
      };

      setCurrentUser(authUser);
      setRegisterForm({ username: "", email: "", password: "", full_name: "" });
      onAuthChange?.(true, authUser, data.session_id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const createAnonymousSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.createAnonymousSession();

      const authUser: AuthUser = {
        id: data.session_id,
        username: anonymousUsername || "anonymous",
        email: null,
        full_name: "Anonymous User",
        session_id: data.session_id,
        auth_driver: data.auth_driver,
        is_authenticated: false,
      };

      setCurrentUser(authUser);
      onAuthChange?.(true, authUser, data.session_id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // Check if this is an anonymous session or authenticated session
      if (
        currentUser?.auth_driver === "none" ||
        currentUser?.auth_driver === "anonymous" ||
        !currentUser?.is_authenticated
      ) {
        // Anonymous session - just clear local state
        await apiClient.logoutWithSession();
      } else {
        // Authenticated session - call logout endpoint
        await apiClient.logout();
      }
      setCurrentUser(null);
      onAuthChange?.(false);
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear user state even if logout fails
      setCurrentUser(null);
      onAuthChange?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state - check this first before user session
  if (!authConfig) {
    return (
      <div
        className={`${className || ""}`}
        style={{
          backgroundColor: theme.background,
          color: theme.text,
          padding: "12px",
          border: `1px solid ${theme.border}`,
          borderRadius: "4px",
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px", gap: "8px" }}>
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontWeight: 500, fontSize: "12px" }}>Loading authentication...</span>
        </div>
      </div>
    );
  }

  // If user is authenticated, show user info
  if (currentUser) {
    // If user has a session (authenticated or anonymous), don't show this panel
    // Let the parent component (NarrationAssistant) handle showing the actual addin interface
    return null;
  }

  // Loading state
  if (!authConfig) {
    return (
      <div
        className={`${className || ""}`}
        style={{
          backgroundColor: theme.background,
          color: theme.text,
          padding: "20px",
          border: `1px solid ${theme.border}`,
          borderRadius: "4px",
          textAlign: "center",
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Show auth forms
  return (
    <div
      className={`${className || ""}`}
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        borderRadius: "4px",
        padding: "16px",
        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
        maxWidth: "100%",
        width: "100%",
      }}
    >
      {error && (
        <div
          style={{
            backgroundColor: theme.error,
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "4px",
            marginBottom: "12px",
            fontSize: "11px",
          }}
        >
          {error}
        </div>
      )}

      {/* Modern Card-Based Tab Design */}
      <div
        style={{
          backgroundColor: theme.surface,
          borderRadius: "8px",
          boxShadow: `0 2px 8px ${theme.shadow}`,
          overflow: "hidden",
          border: `1px solid ${theme.border}`,
          transition: "box-shadow 0.3s ease",
        }}
      >
        {authConfig.requires_auth && (
          <>
            {/* Tab Headers */}
            <div
              style={{
                display: "flex",
                backgroundColor: theme.background,
                borderBottom: `1px solid ${theme.border}`,
                position: "relative",
              }}
            >
              {/* Animated underline indicator */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  height: "2px",
                  backgroundColor: theme.primary,
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  width: authConfig.supports_registration ? "50%" : "100%",
                  transform: `translateX(${currentView === "register" && authConfig.supports_registration ? "100%" : "0"})`,
                }}
              />

              <button
                onClick={() => handleViewChange("login")}
                disabled={isLoading || isTransitioning}
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  backgroundColor: "transparent",
                  color: currentView === "login" ? theme.primary : theme.text,
                  border: "none",
                  fontSize: "13px",
                  fontWeight: currentView === "login" ? "600" : "400",
                  cursor: isLoading || isTransitioning ? "not-allowed" : "pointer",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                  position: "relative",
                  zIndex: 2,
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !isTransitioning && currentView !== "login") {
                    e.currentTarget.style.backgroundColor = theme.surface;
                    e.currentTarget.style.color = theme.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && !isTransitioning && currentView !== "login") {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = theme.text;
                  }
                }}
                onFocus={(e) => {
                  if (!isLoading && !isTransitioning) {
                    e.currentTarget.style.backgroundColor = theme.surface;
                  }
                }}
                onBlur={(e) => {
                  if (currentView !== "login") {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "transform 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && !isTransitioning) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <LogIn size={14} style={{ transition: "color 0.2s ease" }} />
                  <span>Login</span>
                </div>
              </button>

              {authConfig.supports_registration && (
                <button
                  onClick={() => handleViewChange("register")}
                  disabled={isLoading || isTransitioning}
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    backgroundColor: "transparent",
                    color: currentView === "register" ? theme.primary : theme.text,
                    border: "none",
                    fontSize: "13px",
                    fontWeight: currentView === "register" ? "600" : "400",
                    cursor: isLoading || isTransitioning ? "not-allowed" : "pointer",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                    position: "relative",
                    zIndex: 2,
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && !isTransitioning && currentView !== "register") {
                      e.currentTarget.style.backgroundColor = theme.surface;
                      e.currentTarget.style.color = theme.primary;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading && !isTransitioning && currentView !== "register") {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = theme.text;
                    }
                  }}
                  onFocus={(e) => {
                    if (!isLoading && !isTransitioning) {
                      e.currentTarget.style.backgroundColor = theme.surface;
                    }
                  }}
                  onBlur={(e) => {
                    if (currentView !== "register") {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "transform 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && !isTransitioning) {
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <UserPlus size={14} style={{ transition: "color 0.2s ease" }} />
                    <span>Register</span>
                  </div>
                </button>
              )}
            </div>

            {/* Tab Content with Smooth Transitions */}
            <div
              style={{
                padding: "20px",
                position: "relative",
                minHeight: "300px",
                overflow: "hidden",
              }}
            >
              {/* Login Form */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "20px",
                  transform: `translateX(${currentView === "login" ? "0" : "100%"})`,
                  opacity: currentView === "login" ? 1 : 0,
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  pointerEvents: currentView === "login" ? "auto" : "none",
                }}
              >
                <form
                  onSubmit={handleLogin}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    maxWidth: "100%",
                    width: "100%",
                  }}
                >
                  <div style={{ width: "100%" }}>
                    <Label
                      htmlFor="login-username"
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: theme.text,
                        marginBottom: "8px",
                        display: "block",
                        transition: "color 0.2s ease",
                      }}
                    >
                      Username
                    </Label>
                    <input
                      id="login-username"
                      type="text"
                      value={loginForm.username}
                      onChange={(e) =>
                        setLoginForm((prev) => ({ ...prev, username: e.target.value }))
                      }
                      placeholder="Enter your username"
                      required
                      disabled={isLoading}
                      className="ui-input"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        padding: "12px 16px",
                        border: `1px solid ${theme.inputBorder}`,
                        backgroundColor: theme.inputBackground,
                        color: theme.text,
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                        transition: "all 0.2s ease",
                        outline: "none",
                        lineHeight: "1.4",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = theme.inputBorderFocus;
                        e.target.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}20`;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = theme.inputBorder;
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  <div style={{ width: "100%" }}>
                    <Label
                      htmlFor="login-password"
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: theme.text,
                        marginBottom: "8px",
                        display: "block",
                        transition: "color 0.2s ease",
                      }}
                    >
                      Password
                    </Label>
                    <input
                      id="login-password"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) =>
                        setLoginForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                      placeholder="Enter your password"
                      required
                      disabled={isLoading}
                      className="ui-input"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        padding: "12px 16px",
                        border: `1px solid ${theme.inputBorder}`,
                        backgroundColor: theme.inputBackground,
                        color: theme.text,
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                        transition: "all 0.2s ease",
                        outline: "none",
                        lineHeight: "1.4",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = theme.inputBorderFocus;
                        e.target.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}20`;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = theme.inputBorder;
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "12px 24px",
                      backgroundColor: theme.primary,
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      outline: "none",
                      marginTop: "8px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.backgroundColor = theme.primaryHover;
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = `0 4px 12px ${theme.shadow}`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.backgroundColor = theme.primary;
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                    onFocus={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}40`;
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {isLoading ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                        <span>Logging in...</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        <LogIn size={16} />
                        <span>Login</span>
                      </div>
                    )}
                  </button>
                </form>
              </div>

              {/* Register Form */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "20px",
                  transform: `translateX(${currentView === "register" ? "0" : "-100%"})`,
                  opacity: currentView === "register" ? 1 : 0,
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  pointerEvents: currentView === "register" ? "auto" : "none",
                }}
              >
                {authConfig.supports_registration && (
                  <form
                    onSubmit={handleRegister}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      maxWidth: "100%",
                      width: "100%",
                    }}
                  >
                    <div style={{ width: "100%" }}>
                      <Label
                        htmlFor="register-username"
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: theme.text,
                          marginBottom: "8px",
                          display: "block",
                          transition: "color 0.2s ease",
                        }}
                      >
                        Username
                      </Label>
                      <input
                        id="register-username"
                        type="text"
                        value={registerForm.username}
                        onChange={(e) =>
                          setRegisterForm((prev) => ({ ...prev, username: e.target.value }))
                        }
                        placeholder="Choose a username"
                        required
                        disabled={isLoading}
                        className="ui-input"
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box",
                          padding: "12px 16px",
                          border: `1px solid ${theme.inputBorder}`,
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                          transition: "all 0.2s ease",
                          outline: "none",
                          lineHeight: "1.4",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = theme.inputBorderFocus;
                          e.target.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}20`;
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = theme.inputBorder;
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    </div>

                    <div style={{ width: "100%" }}>
                      <Label
                        htmlFor="register-email"
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: theme.text,
                          marginBottom: "8px",
                          display: "block",
                          transition: "color 0.2s ease",
                        }}
                      >
                        Email
                      </Label>
                      <input
                        id="register-email"
                        type="email"
                        value={registerForm.email}
                        onChange={(e) =>
                          setRegisterForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="Enter your email"
                        required
                        disabled={isLoading}
                        className="ui-input"
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box",
                          padding: "12px 16px",
                          border: `1px solid ${theme.inputBorder}`,
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                          transition: "all 0.2s ease",
                          outline: "none",
                          lineHeight: "1.4",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = theme.inputBorderFocus;
                          e.target.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}20`;
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = theme.inputBorder;
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    </div>

                    <div style={{ width: "100%" }}>
                      <Label
                        htmlFor="register-password"
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: theme.text,
                          marginBottom: "8px",
                          display: "block",
                          transition: "color 0.2s ease",
                        }}
                      >
                        Password
                      </Label>
                      <input
                        id="register-password"
                        type="password"
                        value={registerForm.password}
                        onChange={(e) =>
                          setRegisterForm((prev) => ({ ...prev, password: e.target.value }))
                        }
                        placeholder="Create a password"
                        required
                        disabled={isLoading}
                        className="ui-input"
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box",
                          padding: "12px 16px",
                          border: `1px solid ${theme.inputBorder}`,
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                          transition: "all 0.2s ease",
                          outline: "none",
                          lineHeight: "1.4",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = theme.inputBorderFocus;
                          e.target.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}20`;
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = theme.inputBorder;
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "12px 24px",
                        backgroundColor: theme.primary,
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: isLoading ? "not-allowed" : "pointer",
                        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        outline: "none",
                        marginTop: "8px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = theme.primaryHover;
                          e.currentTarget.style.transform = "translateY(-1px)";
                          e.currentTarget.style.boxShadow = `0 4px 12px ${theme.shadow}`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = theme.primary;
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }
                      }}
                      onFocus={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.inputBorderFocus}40`;
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {isLoading ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                          }}
                        >
                          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                          <span>Creating account...</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                          }}
                        >
                          <UserPlus size={16} />
                          <span>Create Account</span>
                        </div>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </>
        )}

        {/* Anonymous Session Section */}
        <div
          style={{
            padding: authConfig.requires_auth ? "0 20px 20px" : "20px",
            borderTop: authConfig.requires_auth ? `1px solid ${theme.border}` : "none",
            marginTop: authConfig.requires_auth ? "0" : "0",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: theme.textSecondary,
                marginBottom: "8px",
              }}
            >
              {authConfig.requires_auth
                ? "Or continue without an account"
                : "Get started immediately"}
            </div>
          </div>

          <button
            onClick={createAnonymousSession}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "12px 24px",
              backgroundColor: authConfig.requires_auth ? "transparent" : theme.primary,
              color: authConfig.requires_auth ? theme.primary : "#fff",
              border: authConfig.requires_auth ? `2px solid ${theme.primary}` : "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              outline: "none",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                if (authConfig.requires_auth) {
                  e.currentTarget.style.backgroundColor = theme.primary;
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 4px 12px ${theme.shadow}`;
                } else {
                  e.currentTarget.style.backgroundColor = theme.primaryHover;
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 4px 12px ${theme.shadow}`;
                }
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                if (authConfig.requires_auth) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = theme.primary;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                } else {
                  e.currentTarget.style.backgroundColor = theme.primary;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }
            }}
            onFocus={(e) => {
              if (!isLoading) {
                e.currentTarget.style.boxShadow = authConfig.requires_auth
                  ? `0 0 0 3px ${theme.inputBorderFocus}40`
                  : `0 0 0 3px ${theme.inputBorderFocus}40`;
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {isLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>Creating session...</span>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "transform 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {authConfig.requires_auth ? (
                  <>
                    <Shield size={16} style={{ transition: "transform 0.2s ease" }} />
                    <span>Continue Anonymously</span>
                  </>
                ) : (
                  <>
                    <ChevronRight size={16} style={{ transition: "transform 0.2s ease" }} />
                    <span>Start Using SlideScribe</span>
                  </>
                )}
              </div>
            )}
          </button>

          <div
            style={{
              fontSize: "10px",
              color: theme.textSecondary,
              textAlign: "center",
              marginTop: "8px",
              lineHeight: "1.3",
            }}
          >
            Session expires after {Math.floor(authConfig.anonymous_session_expire_minutes / 60)}{" "}
            hours
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnhancedAuthPanel;
