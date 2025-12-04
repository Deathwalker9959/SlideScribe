/**
 * COM Bridge Integration via WebSocket
 * Provides access to COM Add-in functionality for advanced media manipulation when Office.js APIs are insufficient.
 */

interface ComBridgeMessage {
  id: string;
  method: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

interface ComBridgeResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: string;
  encryptedPayload?: string;
  iv?: string;
}

const BRIDGE_URL = "ws://localhost:8765/slidescribe-com-bridge/";
const IS_DEV_BUILD = process.env.NODE_ENV !== "production";
const REQUEST_TIMEOUT_MS = 30000;

// Encoding helpers
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return window.btoa(binary);
};

const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export class ComBridgeConnection {
  private static instance: ComBridgeConnection;
  private isAvailable = false;
  private socket?: WebSocket;
  private sessionKey: CryptoKey | null = null;
  private handshakePromise: Promise<boolean> | null = null;
  private authToken: string | null = null;

  private constructor() {
    this.detectComBridge();
  }

  public static getInstance(): ComBridgeConnection {
    if (!ComBridgeConnection.instance) {
      ComBridgeConnection.instance = new ComBridgeConnection();
    }
    return ComBridgeConnection.instance;
  }

  private detectComBridge(): void {
    try {
      const isInPowerPoint =
        typeof Office !== "undefined" &&
        Office.context &&
        Office.context.host === Office.HostType.PowerPoint;

      if (isInPowerPoint) {
        this.connectToWebSocketBridge();
      } else {
        this.isAvailable = false;
      }
    } catch {
      this.isAvailable = false;
    }
  }

  private connectToWebSocketBridge(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.isAvailable = true;
      return;
    }

    try {
      this.socket = new WebSocket(BRIDGE_URL);

      this.socket.onopen = () => {
        this.isAvailable = true;
        this.handshakePromise = this.performSecureHandshake();
        this.handshakePromise
          .then(async (ok) => {
            if (!ok) {
              throw new Error("Secure handshake failed");
            }
            const testResult = await this.testConnection();
            this.isAvailable = testResult;
          })
          .catch((err) => {
            console.warn("[COM Bridge] Initialization failed:", err);
            this.isAvailable = false;
          });
      };

      this.socket.onclose = () => {
        this.isAvailable = false;
        this.sessionKey = null;
        this.authToken = null;
        this.handshakePromise = null;
        setTimeout(() => {
          if (typeof Office !== "undefined" && Office.context?.host === Office.HostType.PowerPoint) {
            this.connectToWebSocketBridge();
          }
        }, 5000);
      };

      this.socket.onerror = (ev) => {
        console.error("[COM Bridge] WebSocket error:", ev);
        this.isAvailable = false;
      };
    } catch (error) {
      console.warn("[COM Bridge] Failed to connect:", error);
      this.isAvailable = false;
    }
  }

  private async sendMessage(
    message: ComBridgeMessage,
    options: { skipHandshake?: boolean; encrypt?: boolean } = {}
  ): Promise<ComBridgeResponse> {
    const shouldEncrypt = options.encrypt !== false;

    if (this.handshakePromise && !options.skipHandshake) {
      const ok = await this.handshakePromise;
      if (!ok) {
        throw new Error("Secure handshake failed; cannot send message.");
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        this.socket?.removeEventListener("message", handleMessage);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      const handleMessage = async (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          const decrypted =
            this.sessionKey && parsed.encryptedPayload
              ? await this.decryptPayload(parsed.encryptedPayload, parsed.iv)
              : null;

          const response: ComBridgeResponse = decrypted ? JSON.parse(decrypted) : parsed;

          if (response.id === message.id) {
            clearTimeout(timeout);
            this.socket?.removeEventListener("message", handleMessage);
            resolve(response);
          }
        } catch (error) {
          clearTimeout(timeout);
          this.socket?.removeEventListener("message", handleMessage);
          console.error("[COM Bridge] Response parse/decrypt failed:", error);
          reject(new Error(`Failed to parse response: ${error}`));
        }
      };

      this.socket.addEventListener("message", handleMessage);

      // Build payload with auth token
      const payload: ComBridgeMessage = {
        ...message,
        parameters: {
          ...message.parameters,
          ...(this.authToken ? { authToken: this.authToken } : {}),
        },
      };

      if (shouldEncrypt) {
        if (!this.sessionKey) {
          clearTimeout(timeout);
          this.socket?.removeEventListener("message", handleMessage);
          reject(new Error("Secure channel not established."));
          return;
        }
        this.encryptPayload(JSON.stringify(payload))
          .then(({ encryptedPayload, iv }) => {
            this.socket?.send(JSON.stringify({ id: payload.id, encryptedPayload, iv }));
          })
          .catch((err) => {
            clearTimeout(timeout);
            this.socket?.removeEventListener("message", handleMessage);
            reject(err);
          });
      } else {
        this.socket.send(JSON.stringify(payload));
      }
    });
  }

  /**
   * Establish a symmetric AES session derived from the shared bridge token.
   */
  private async performSecureHandshake(): Promise<boolean> {
    try {
      if (!window.crypto?.subtle) {
        return false;
      }

      const authResponse = await this.sendMessage(
        {
          id: `auth_${Date.now()}`,
          method: "requestAuth",
          parameters: {},
          timestamp: new Date().toISOString(),
        },
        { skipHandshake: true, encrypt: false }
      );

      if (!authResponse.success || !authResponse.result) {
        throw new Error("Failed to obtain auth token.");
      }

      this.authToken = authResponse.result as string;

      // Derive AES key from token using SHA-256
      const tokenBytes = new TextEncoder().encode(this.authToken);
      const tokenHash = await window.crypto.subtle.digest("SHA-256", tokenBytes);
      this.sessionKey = await window.crypto.subtle.importKey(
        "raw",
        tokenHash,
        { name: "AES-CBC" },
        false,
        ["encrypt", "decrypt"]
      );

      return !!this.sessionKey;
    } catch (error) {
      console.warn("[COM Bridge] Secure handshake failed:", error);
      this.sessionKey = null;
      this.authToken = null;
      return false;
    }
  }

  private async encryptPayload(plaintext: string): Promise<{ encryptedPayload: string; iv: string }> {
    if (!this.sessionKey || !window.crypto?.subtle) {
      throw new Error("Secure session unavailable.");
    }
    const ivBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const encoded = new TextEncoder().encode(plaintext);
    const cipher = await window.crypto.subtle.encrypt(
      { name: "AES-CBC", iv: ivBytes },
      this.sessionKey,
      encoded
    );
    return { encryptedPayload: bufferToBase64(cipher), iv: bufferToBase64(ivBytes.buffer) };
  }

  private async decryptPayload(encryptedPayload: string, iv?: string | null): Promise<string | null> {
    try {
      if (!this.sessionKey || !window.crypto?.subtle || !iv) {
        return null;
      }
      const cipherBuffer = base64ToBuffer(encryptedPayload);
      const ivBuffer = base64ToBuffer(iv);
      const data = await window.crypto.subtle.decrypt(
        { name: "AES-CBC", iv: new Uint8Array(ivBuffer) },
        this.sessionKey,
        cipherBuffer
      );
      return new TextDecoder().decode(data);
    } catch (error) {
      console.warn("[COM Bridge] Decryption failed:", error);
      return null;
    }
  }

  public async testConnection(): Promise<boolean> {
    if (!this.isAvailable || !this.socket) {
      return false;
    }

    try {
      const response = await this.sendMessage({
        id: `test_${Date.now()}`,
        method: "testConnection",
        parameters: {},
        timestamp: new Date().toISOString(),
      });

      return response.success && (response.result === true || response.result === "True");
    } catch (error) {
      console.error("[COM Bridge] Test failed:", error);
      return false;
    }
  }

  public async embedAudioFromFile(audioFilePath: string, slideNumber: number = -1): Promise<void> {
    if (!this.isAvailable || !this.socket) {
      throw new Error("COM Bridge not available. Please ensure the COM Add-in is installed.");
    }

    const response = await this.sendMessage({
      id: `embed_${Date.now()}`,
      method: "embedAudioFromFile",
      parameters: { audioFilePath, slideNumber },
      timestamp: new Date().toISOString(),
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to embed audio");
    }
  }

  public async getSlideAudioInfo(slideNumber: number): Promise<string> {
    if (!this.isAvailable || !this.socket) {
      return "COM Bridge not available";
    }

    const response = await this.sendMessage({
      id: `info_${Date.now()}`,
      method: "getSlideAudioInfo",
      parameters: { slideNumber },
      timestamp: new Date().toISOString(),
    });

    if (response.success) {
      return (response.result as string) || "No audio information available";
    }
    return `Error: ${response.error}`;
  }

  public async setAudioSettings(
    slideNumber: number,
    autoPlay: boolean = true,
    hideWhilePlaying: boolean = true,
    volume: number = 1.0
  ): Promise<void> {
    if (!this.isAvailable || !this.socket) {
      throw new Error("COM Bridge not available");
    }

    const response = await this.sendMessage({
      id: `settings_${Date.now()}`,
      method: "setAudioSettings",
      parameters: { slideNumber, autoPlay, hideWhilePlaying, volume },
      timestamp: new Date().toISOString(),
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to set audio settings");
    }
  }

  public async removeAudioFromSlides(slideNumbers: string = "all"): Promise<void> {
    if (!this.isAvailable || !this.socket) {
      throw new Error("COM Bridge not available");
    }

    const response = await this.sendMessage({
      id: `remove_${Date.now()}`,
      method: "removeAudioFromSlides",
      parameters: { slideNumbers },
      timestamp: new Date().toISOString(),
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to remove audio");
    }
  }

  public getAvailability(): { isAvailable: boolean; connectionStatus: "available" | "unavailable" } {
    return {
      isAvailable: this.isAvailable,
      connectionStatus: this.isAvailable ? "available" : "unavailable",
    };
  }

  public async detectAndInitialize(): Promise<boolean> {
    // If already connected and available, just test the connection
    if (this.isAvailable && this.socket?.readyState === WebSocket.OPEN) {
      try {
        const testResult = await this.testConnection();
        return testResult;
      } catch {
        this.isAvailable = false;
      }
    }

    // Try to reconnect
    this.detectComBridge();

    // Wait for connection
    if (!this.isAvailable) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (this.isAvailable && this.handshakePromise) {
      try {
        await this.handshakePromise;
        const testResult = await this.testConnection();
        this.isAvailable = testResult;
        return testResult;
      } catch {
        this.isAvailable = false;
      }
    }

    return false;
  }
}

// Export singleton instance
export const comBridge = ComBridgeConnection.getInstance();
