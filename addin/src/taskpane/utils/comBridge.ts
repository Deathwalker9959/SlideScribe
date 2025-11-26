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
}

const BRIDGE_TOKEN = process.env.SLIDESCRIBE_BRIDGE_TOKEN || "";
const BRIDGE_URL = "ws://localhost:8765/slidescribe-com-bridge";

export class ComBridgeConnection {
  private static instance: ComBridgeConnection;
  private isAvailable = false;
  private socket?: WebSocket;
  private bridgeToken: string = BRIDGE_TOKEN;

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
        if (!this.bridgeToken) {
          console.warn("COM Bridge auth token missing; set SLIDESCRIBE_BRIDGE_TOKEN in your environment/build config.");
        }
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
        this.requestAuthToken().catch((error) => {
          console.warn("COM Bridge auth token request failed:", error);
          this.isAvailable = false;
        });
        this.testConnection()
          .then((result) => {
            if (!result) {
              this.isAvailable = false;
            }
          })
          .catch(() => {
            this.isAvailable = false;
          });
      };

      this.socket.onclose = () => {
        this.isAvailable = false;
        setTimeout(() => {
          if (typeof Office !== "undefined" && Office.context?.host === Office.HostType.PowerPoint) {
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
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("COM Bridge WebSocket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("COM Bridge request timeout"));
      }, 10000);

      const handleMessage = (event: MessageEvent) => {
        try {
          const response: ComBridgeResponse = JSON.parse(event.data);
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
          authToken: this.bridgeToken,
        },
      };
      this.socket.send(JSON.stringify(payload));
    });
  }

  private async requestAuthToken(): Promise<void> {
    // Use a one-time handshake to get token if not preset
    if (this.bridgeToken) {
      return;
    }

    const response = await this.sendMessage({
      id: `auth_${Date.now()}`,
      method: "requestAuth",
      parameters: {},
      timestamp: new Date().toISOString(),
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || "Failed to obtain auth token");
    }

    this.bridgeToken = String(response.result);
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
