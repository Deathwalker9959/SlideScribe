/**
 * COM Bridge Integration via WebSocket
 * Provides access to COM Add-in functionality for advanced media manipulation when Office.js APIs are insufficient.
 */

interface ComBridgeMessage {
  id: string;
  method: string;
  parameters: Record<string, any>;
  timestamp: string;
}

interface ComBridgeResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: string;
  encryptedPayload?: string;
  iv?: string;
}

const BRIDGE_URL = "ws://localhost:8765/slidescribe-com-bridge";
const IS_DEV_BUILD = process.env.NODE_ENV !== "production";

// Encoding helpers
const bufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return typeof window !== "undefined" ? window.btoa(binary) : Buffer.from(binary, "binary").toString("base64");
};

const base64ToBuffer = (base64: string) => {
  const binary = typeof window !== "undefined" ? window.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export class ComBridgeConnection {
  private static instance: ComBridgeConnection;
  private isAvailable = false;
  private socket?: WebSocket;
  private rsaKeyPair: CryptoKeyPair | null = null;
  private sessionKey: CryptoKey | null = null;
  private handshakePromise: Promise<boolean> | null = null;

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
        console.log("COM Bridge only available inside PowerPoint.");
        this.isAvailable = false;
      }
    } catch (error) {
      console.warn("COM Bridge detection failed:", error);
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
          .then((ok) => {
            if (!ok) {
              console.warn("COM Bridge handshake failed; connection disabled for safety.");
              this.isAvailable = false;
              return false;
            }
            return this.testConnection();
          })
          .then((result) => {
            if (!result) {
              this.isAvailable = false;
            }
          })
          .catch((err) => {
            console.warn("COM Bridge initialization failed:", err);
            this.isAvailable = false;
          });
      };

      this.socket.onclose = () => {
        this.isAvailable = false;
        setTimeout(() => {
          if (
            typeof Office !== "undefined" &&
            Office.context?.host === Office.HostType.PowerPoint
          ) {
            this.connectToWebSocketBridge();
          }
        }, 5000);
      };

      this.socket.onerror = () => {
        this.isAvailable = false;
      };
    } catch (error) {
      console.warn("Failed to connect to COM Bridge WebSocket:", error);
      this.isAvailable = false;
    }
  }

  private async sendMessage(message: ComBridgeMessage): Promise<ComBridgeResponse> {
    if (this.handshakePromise) {
      const ok = await this.handshakePromise;
      if (!ok) {
        throw new Error("COM Bridge secure handshake failed.");
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("COM Bridge WebSocket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("COM Bridge request timeout"));
      }, 10000);

      const handleMessage = async (event: MessageEvent) => {
        try {
          const parsed: ComBridgeResponse = JSON.parse(event.data);
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
          reject(new Error(`Failed to parse COM Bridge response: ${error}`));
        }
      };

      this.socket.addEventListener("message", handleMessage);
      const payload: ComBridgeMessage = {
        ...message,
        parameters: {
          ...(message.parameters || {}),
        },
      };

      if (this.sessionKey) {
        this.encryptPayload(JSON.stringify(payload)).then(({ encryptedPayload, iv }) => {
          this.socket?.send(
            JSON.stringify({
              id: payload.id,
              encryptedPayload,
              iv,
            })
          );
        });
      } else {
        this.socket.send(JSON.stringify(payload));
      }
    });
  }

  /**
   * Perform an RSA + AES-GCM key exchange to secure IPC traffic.
   * Falls back to plaintext if crypto is unavailable or handshake fails.
   */
  private async performSecureHandshake(): Promise<boolean> {
    try {
      if (typeof window === "undefined" || !window.crypto?.subtle) {
        return false;
      }

      this.rsaKeyPair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
      );

      const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", this.rsaKeyPair.publicKey);
      const publicKeyBase64 = bufferToBase64(publicKeyBuffer);

      const response = await this.sendMessage({
        id: `handshake_${Date.now()}`,
        method: "negotiateSession",
        parameters: { publicKey: publicKeyBase64 },
        timestamp: new Date().toISOString(),
      });

      const encryptedSessionKey = response.result?.encryptedSessionKey as string | undefined;
      const iv = response.result?.iv as string | undefined;
      if (!response.success || !encryptedSessionKey) {
        return false;
      }

      const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        this.rsaKeyPair.privateKey,
        base64ToBuffer(encryptedSessionKey)
      );

      this.sessionKey = await window.crypto.subtle.importKey(
        "raw",
        decryptedKeyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );

      // Optionally validate by decrypting a challenge payload
      if (response.result?.encryptedChallenge && iv) {
        const challenge = this.decryptPayload(response.result.encryptedChallenge, iv);
        if (!challenge) {
          this.sessionKey = null;
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn("Secure handshake failed:", error);
      this.sessionKey = null;
      this.rsaKeyPair = null;
      return false;
    }
  }

  private async encryptPayload(plaintext: string): Promise<{ encryptedPayload: string; iv: string }> {
    if (!this.sessionKey || !window.crypto?.subtle) {
      return { encryptedPayload: plaintext, iv: "" };
    }
    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipher = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBytes },
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
        { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
        this.sessionKey,
        cipherBuffer
      );
      return new TextDecoder().decode(data);
    } catch (error) {
      console.warn("Failed to decrypt COM Bridge payload:", error);
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
      console.error("COM Bridge test failed:", error);
      return false;
    }
  }

  public async embedAudioFromFile(audioFilePath: string, slideNumber: number = -1): Promise<void> {
    if (!this.isAvailable || !this.socket) {
      throw new Error("COM Bridge not available. Please ensure the COM Add-in is installed.");
    }

    const message = {
      id: `embed_${Date.now()}`,
      method: "embedAudioFromFile",
      parameters: { audioFilePath, slideNumber },
      timestamp: new Date().toISOString(),
    };

    const response = await this.sendMessage(message);

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

  public getAvailability(): {
    isAvailable: boolean;
    connectionStatus: "available" | "unavailable";
  } {
    return {
      isAvailable: this.isAvailable,
      connectionStatus: this.isAvailable ? "available" : "unavailable",
    };
  }

  public async detectAndInitialize(): Promise<boolean> {
    this.detectComBridge();

    if (!this.isAvailable) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (this.isAvailable) {
      const testResult = await this.testConnection();
      if (testResult) {
        return true;
      }
      this.isAvailable = false;
    }

    return false;
  }
}

// Export singleton instance
export const comBridge = ComBridgeConnection.getInstance();
