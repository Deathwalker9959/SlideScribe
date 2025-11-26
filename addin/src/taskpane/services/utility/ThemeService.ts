/**
 * Theme Service
 * Handles PowerPoint theme detection and management for the taskpane
 */

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryHover: string;
  inputBackground: string;
  inputBorder: string;
  error: string;
  success: string;
}

export interface Theme {
  mode: "light" | "dark" | "auto";
  colors: ThemeColors;
}

export type ThemeChangeCallback = (theme: Theme) => void;
export type Unsubscribe = () => void;

export interface ThemeService {
  detectPowerPointTheme(): Promise<Theme>;
  getCurrentTheme(): Theme;
  setTheme(theme: Partial<Theme>): void;
  subscribeToThemeChanges(callback: ThemeChangeCallback): Unsubscribe;
  isDarkTheme(): boolean;
  getSystemPreference(): "light" | "dark" | "no-preference";
}

/**
 * Theme Service Implementation
 */
export class PowerPointThemeService implements ThemeService {
  private currentTheme: Theme;
  private callbacks: Set<ThemeChangeCallback> = new Set();
  private mediaQuery: MediaQueryList | null = null;
  private observer: MutationObserver | null = null;

  constructor() {
    this.currentTheme = this.createDefaultTheme();
    this.initializeSystemPreferenceDetection();
    this.initializeDOMObserver();
  }

  async detectPowerPointTheme(): Promise<Theme> {
    const detectedMode = await this.detectThemeMode();
    const colors = this.getThemeColors(detectedMode);

    this.currentTheme = {
      mode: detectedMode,
      colors,
    };

    this.notifyThemeChange();
    return this.currentTheme;
  }

  getCurrentTheme(): Theme {
    return { ...this.currentTheme };
  }

  setTheme(theme: Partial<Theme>): void {
    if (theme.mode) {
      this.currentTheme.mode = theme.mode;
    }

    if (theme.colors) {
      this.currentTheme.colors = { ...this.currentTheme.colors, ...theme.colors };
    }

    this.notifyThemeChange();
  }

  subscribeToThemeChanges(callback: ThemeChangeCallback): Unsubscribe {
    this.callbacks.add(callback);

    // Immediately call with current theme
    callback(this.currentTheme);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  isDarkTheme(): boolean {
    return this.currentTheme.mode === "dark";
  }

  getSystemPreference(): "light" | "dark" | "no-preference" {
    if (this.mediaQuery && this.mediaQuery.matches) {
      return "dark";
    }

    // Check for system preference via CSS
    if (typeof window !== "undefined") {
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (darkModeQuery.matches) {
        return "dark";
      }

      const lightModeQuery = window.matchMedia("(prefers-color-scheme: light)");
      if (lightModeQuery.matches) {
        return "light";
      }
    }

    return "no-preference";
  }

  /**
   * Detect theme mode from PowerPoint environment
   */
  private async detectThemeMode(): Promise<"light" | "dark"> {
    if (typeof document === "undefined") {
      return "light";
    }

    try {
      // Method 1: Check PowerPoint-specific body classes
      const bodyClass = document.body.className;
      if (bodyClass.includes("dark") || bodyClass.includes("theme-dark")) {
        return "dark";
      }
      if (bodyClass.includes("light") || bodyClass.includes("theme-light")) {
        return "light";
      }

      // Method 2: Check computed background color
      const bgColor = window.getComputedStyle(document.body).backgroundColor;
      if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
        const luminance = this.calculateLuminance(bgColor);
        if (luminance < 0.5) {
          return "dark";
        }
        return "light";
      }

      // Method 3: Check Office-specific meta tags or data attributes
      const officeTheme = document.body.getAttribute("data-office-theme");
      if (officeTheme === "dark") {
        return "dark";
      }
      if (officeTheme === "light") {
        return "light";
      }

      // Method 4: Check for PowerPoint application element
      const pptElement = document.querySelector('[data-app="powerpoint"]');
      if (pptElement) {
        const pptBgColor = window.getComputedStyle(pptElement).backgroundColor;
        if (pptBgColor && pptBgColor !== "rgba(0, 0, 0, 0)") {
          const luminance = this.calculateLuminance(pptBgColor);
          if (luminance < 0.5) {
            return "dark";
          }
          return "light";
        }
      }

      // Method 5: Check root element CSS variables
      const rootElement = document.documentElement;
      const rootBgColor = window.getComputedStyle(rootElement).backgroundColor;
      if (rootBgColor && rootBgColor !== "rgba(0, 0, 0, 0)") {
        const luminance = this.calculateLuminance(rootBgColor);
        if (luminance < 0.5) {
          return "dark";
        }
        return "light";
      }

      // Method 6: Fall back to system preference
      const systemPreference = this.getSystemPreference();
      if (systemPreference === "dark") {
        return "dark";
      }
      if (systemPreference === "light") {
        return "light";
      }

      // Default to light theme
      return "light";
    } catch (error) {
      console.warn("Failed to detect PowerPoint theme:", error);
      return "light";
    }
  }

  /**
   * Calculate luminance of a color to determine if it's light or dark
   */
  private calculateLuminance(color: string): number {
    // Convert color to RGB
    let r: number, g: number, b: number;

    if (color.startsWith("#")) {
      // Hex color
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else if (color.startsWith("rgb")) {
      // RGB color
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        r = parseInt(matches[0]);
        g = parseInt(matches[1]);
        b = parseInt(matches[2]);
      } else {
        return 1; // Default to light if parsing fails
      }
    } else {
      return 1; // Default to light for unknown formats
    }

    // Calculate relative luminance
    const sRGB = [r, g, b].map((val) => val / 255);
    const linearRGB = sRGB.map((val) => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * linearRGB[0] + 0.7152 * linearRGB[1] + 0.0722 * linearRGB[2];
  }

  /**
   * Get theme colors based on mode
   */
  private getThemeColors(mode: "light" | "dark"): ThemeColors {
    if (mode === "dark") {
      return {
        background: "#2D2D30",
        surface: "#3E3E42",
        border: "#4D4D50",
        text: "#FFFFFF",
        textSecondary: "#CCCCCC",
        primary: "#4080FF",
        primaryHover: "#5A9CFF",
        inputBackground: "#404040",
        inputBorder: "#606060",
        error: "#E74C3C",
        success: "#5CB85C",
      };
    } else {
      return {
        background: "#FFFFFF",
        surface: "#F1F3F4",
        border: "#D1D1D1",
        text: "#2D2D30",
        textSecondary: "#666666",
        primary: "#0078D4",
        primaryHover: "#106EBE",
        inputBackground: "#FFFFFF",
        inputBorder: "#CCCCCC",
        error: "#E74C3C",
        success: "#5CB85C",
      };
    }
  }

  /**
   * Create default theme
   */
  private createDefaultTheme(): Theme {
    return {
      mode: "light",
      colors: this.getThemeColors("light"),
    };
  }

  /**
   * Initialize system preference detection
   */
  private initializeSystemPreferenceDetection(): void {
    if (typeof window !== "undefined") {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleMediaChange = () => {
        // Only auto-update if current theme mode is 'auto'
        if (this.currentTheme.mode === "auto") {
          this.detectPowerPointTheme().catch(console.warn);
        }
      };

      this.mediaQuery.addEventListener("change", handleMediaChange);
    }
  }

  /**
   * Initialize DOM observer for theme changes
   */
  private initializeDOMObserver(): void {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;

          // Check for theme-related attribute changes
          if (
            target === document.body &&
            (mutation.attributeName === "class" || mutation.attributeName === "data-office-theme")
          ) {
            shouldUpdate = true;
            break;
          }
        } else if (mutation.type === "childList") {
          // Check if theme-related elements were added/removed
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (
                element.hasAttribute("data-office-theme") ||
                element.className?.includes("theme-")
              ) {
                shouldUpdate = true;
                break;
              }
            }
          }
        }

        if (shouldUpdate) break;
      }

      if (shouldUpdate) {
        // Debounce theme detection
        setTimeout(() => {
          this.detectPowerPointTheme().catch(console.warn);
        }, 100);
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-office-theme"],
      childList: true,
      subtree: true,
    });
  }

  /**
   * Notify all subscribers of theme changes
   */
  private notifyThemeChange(): void {
    const theme = { ...this.currentTheme };
    this.callbacks.forEach((callback) => {
      try {
        callback(theme);
      } catch (error) {
        console.warn("Error in theme change callback:", error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener("change", () => {});
    }

    if (this.observer) {
      this.observer.disconnect();
    }

    this.callbacks.clear();
  }
}

/**
 * Theme Service Factory
 */
export class ThemeServiceFactory {
  private static instance: ThemeService;

  static getInstance(): ThemeService {
    if (!this.instance) {
      this.instance = new PowerPointThemeService();
    }
    return this.instance;
  }

  static create(): ThemeService {
    return new PowerPointThemeService();
  }
}

// Export default instance
export default ThemeServiceFactory.getInstance();
