/**
 * URL building and resolution service
 */
export class UrlService {
  /**
   * Build WebSocket URL for progress tracking
   */
  static buildWebSocketUrl(clientId: string): string {
    const overrides: (string | undefined)[] = [
      typeof window !== "undefined" ? window.__SLIDESCRIBE_PROGRESS_WS__ : undefined,
      typeof window !== "undefined" ? window.__SLIDESCRIBE_BACKEND_URL__ : undefined,
      typeof window !== "undefined" ? `${window.location.origin}` : undefined,
      "http://localhost:8000",
    ];

    for (const base of overrides) {
      if (!base) continue;
      try {
        const url = new URL(base);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = "/ws/progress";
        url.searchParams.set("client_id", clientId);
        return url.toString();
      } catch (error) {
        console.warn(`Invalid WebSocket base URL: ${base}`, error);
      }
    }

    return `ws://localhost:8000/ws/progress?client_id=${encodeURIComponent(clientId)}`;
  }

  /**
   * Build HTTP URL for backend API
   */
  static buildBackendHttpUrl(path: string): string {
    const overrides: (string | undefined)[] = [
      typeof window !== "undefined" ? window.__SLIDESCRIBE_BACKEND_URL__ : undefined,
      typeof window !== "undefined" ? `${window.location.origin}` : undefined,
      "http://localhost:8000",
    ];

    for (const base of overrides) {
      if (!base) continue;
      try {
        const url = new URL(base);
        url.pathname = path;
        return url.toString();
      } catch (error) {
        console.warn(`Invalid HTTP base URL: ${base}`, error);
      }
    }

    return `http://localhost:8000${path}`;
  }

  /**
   * Resolve download URL
   */
  static resolveDownloadUrl(
    relativeUrl: string | null | undefined,
    buildBackendUrl: (path: string) => string
  ): string | null {
    if (!relativeUrl) {
      return null;
    }

    try {
      new URL(relativeUrl);
      return relativeUrl;
    } catch {
      // Not a full URL, treat as relative
    }

    const trimmed = relativeUrl.trim();
    if (trimmed.startsWith("/")) {
      return buildBackendUrl(trimmed);
    }

    return buildBackendUrl(`/${trimmed}`);
  }

  /**
   * Resolve media URL (audio, images, etc.)
   */
  static resolveMediaUrl(
    mediaPath: string | null | undefined,
    buildBackendUrl: (path: string) => string
  ): string | null {
    if (!mediaPath) {
      return null;
    }

    try {
      new URL(mediaPath);
      return mediaPath;
    } catch {
      // Not a full URL
    }

    const trimmed = mediaPath.trim();
    if (trimmed.startsWith("data:")) {
      return trimmed;
    }

    if (trimmed.startsWith("/media/") || trimmed.startsWith("media/")) {
      const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      return buildBackendUrl(normalized);
    }

    return buildBackendUrl(`/media/${trimmed}`);
  }
}
