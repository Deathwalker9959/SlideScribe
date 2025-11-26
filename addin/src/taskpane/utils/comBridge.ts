/**
 * COM Bridge Integration via Named Pipe IPC
 * Provides access to COM Add-in functionality for advanced media manipulation
 * when Office.js APIs are insufficient
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

// Note: Named pipes in Windows require a different approach in Node.js
// We'll use a WebSocket bridge server for cross-platform compatibility

export class ComBridgeConnection {
  private static instance: ComBridgeConnection;
  private isAvailable: boolean = false;
  private socket?: WebSocket;

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
      // Check if we're running in PowerPoint (Office.js environment)
      const isInPowerPoint = typeof Office !== "undefined" && Office.context && Office.context.host === Office.HostType.PowerPoint;

      if (isInPowerPoint) {
        console.log("🖥️ Running in PowerPoint environment");
        console.log("🔗 Attempting to connect to COM Bridge WebSocket...");
        this.connectToWebSocketBridge();
      } else {
        console.log("ℹ️ Running in browser environment (not PowerPoint)");
        console.log("💡 COM Bridge will only be available when running inside PowerPoint");
        console.log("📝 To test COM Bridge:");
        console.log("   1. Install the COM Add-in in PowerPoint");
        console.log("   2. Sideload this Office.js add-in in PowerPoint");
        console.log("   3. COM Bridge will auto-connect when both are running");
        this.isAvailable = false;
      }

    } catch (error) {
      console.log("❌ COM Bridge detection failed:", error);
      this.isAvailable = false;
    }
  }

  private connectToWebSocketBridge(): void {
    // Check if already connected
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log("🔗 COM Bridge already connected");
      this.isAvailable = true;
      return;
    }

    try {
      // Connect to local WebSocket bridge server
      this.socket = new WebSocket("ws://localhost:8765/slidescribe-com-bridge");

      this.socket.onopen = () => {
        console.log("✅ Successfully connected to SlideScribe COM Bridge!");
        console.log("🎯 COM Bridge is ready for advanced audio embedding");
        this.isAvailable = true;

        // Test the connection immediately to ensure it's working
        this.testConnection().then(result => {
          console.log(`🔍 COM Bridge connection test: ${result ? 'PASSED' : 'FAILED'}`);
          if (!result) {
            this.isAvailable = false;
          }
        }).catch(error => {
          console.warn("⚠️ COM Bridge connection test failed:", error);
          this.isAvailable = false;
        });
      };

      this.socket.onclose = (event) => {
        console.log("🔌 Disconnected from SlideScribe COM Bridge");
        if (event.code === 1006) {
          console.log("💡 Connection refused - COM Add-in may not be running");
          console.log("📋 Ensure the SlideScribe COM Add-in is installed and loaded in PowerPoint");
        }
        this.isAvailable = false;

        // Retry connection after delay only if in PowerPoint
        setTimeout(() => {
          if (typeof Office !== "undefined" && Office.context?.host === Office.HostType.PowerPoint) {
            console.log("🔄 Retrying COM Bridge connection...");
            this.connectToWebSocketBridge();
          }
        }, 5000);
      };

      this.socket.onerror = (error) => {
        console.log("⚠️ COM Bridge WebSocket connection failed");
        console.log("💡 This usually means:");
        console.log("   • COM Add-in is not running in PowerPoint");
        console.log("   • WebSocket server hasn't started yet");
        console.log("   • Port 8765 is blocked by firewall");
        this.isAvailable = false;
      };

    } catch (error) {
      console.log("❌ Failed to connect to COM Bridge WebSocket:", error);
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
      }, 10000); // 10 second timeout

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
      this.socket.send(JSON.stringify(message));
    });
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
        timestamp: new Date().toISOString()
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

    try {
      console.log(`🔍 COM Bridge sending: audioFilePath="${audioFilePath}", slideNumber=${slideNumber}`);

      const message = {
        id: `embed_${Date.now()}`,
        method: "embedAudioFromFile",
        parameters: { audioFilePath, slideNumber },
        timestamp: new Date().toISOString()
      };

      console.log("📤 Full message being sent:", JSON.stringify(message, null, 2));

      const response = await this.sendMessage(message);

      if (!response.success) {
        throw new Error(response.error || "Failed to embed audio");
      }
    } catch (error) {
      console.error("Failed to embed audio via COM Bridge:", error);
      throw error;
    }
  }

  public async getSlideAudioInfo(slideNumber: number): Promise<string> {
    if (!this.isAvailable || !this.socket) {
      return "COM Bridge not available";
    }

    try {
      const response = await this.sendMessage({
        id: `info_${Date.now()}`,
        method: "getSlideAudioInfo",
        parameters: { slideNumber },
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        return response.result as string || "No audio information available";
      } else {
        return `Error: ${response.error}`;
      }
    } catch (error) {
      console.error("Failed to get audio info via COM Bridge:", error);
      return `Error: ${error}`;
    }
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

    try {
      const response = await this.sendMessage({
        id: `settings_${Date.now()}`,
        method: "setAudioSettings",
        parameters: { slideNumber, autoPlay, hideWhilePlaying, volume },
        timestamp: new Date().toISOString()
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to set audio settings");
      }
    } catch (error) {
      console.error("Failed to set audio settings via COM Bridge:", error);
      throw error;
    }
  }

  public async removeAudioFromSlides(slideNumbers: string = "all"): Promise<void> {
    if (!this.isAvailable || !this.socket) {
      throw new Error("COM Bridge not available");
    }

    try {
      const response = await this.sendMessage({
        id: `remove_${Date.now()}`,
        method: "removeAudioFromSlides",
        parameters: { slideNumbers },
        timestamp: new Date().toISOString()
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to remove audio");
      }
    } catch (error) {
      console.error("Failed to remove audio via COM Bridge:", error);
      throw error;
    }
  }

  public getAvailability(): {
    isAvailable: boolean;
    connectionStatus: "available" | "unavailable" | "testing";
  } {
    return {
      isAvailable: this.isAvailable,
      connectionStatus: this.isAvailable ? "available" : "unavailable",
    };
  }

  public async enhancedEmbedAudio(audioUrl: string, slideNumber: number = -1): Promise<void> {
    try {
      // First, try to use COM Bridge if available
      if (this.isAvailable) {
        console.log("Using COM Bridge for enhanced audio embedding");

        // Download audio to temp file for COM processing
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        const tempFileName = `slidescribe_temp_${Date.now()}.wav`;

        // In a real implementation, you'd need to save the blob to a temp file
        // This would require additional permissions and file system access
        // For now, we'll fall back to Office.js if COM Bridge can't handle the blob

        // Fallback: try to embed via COM Bridge with URL if it supports it
        await this.embedAudioFromFile(audioUrl, slideNumber);
      } else {
        throw new Error("COM Bridge not available for enhanced embedding");
      }
    } catch (error) {
      console.error("Enhanced audio embedding failed:", error);
      throw error;
    }
  }

  public async detectAndInitialize(): Promise<boolean> {
    console.log("🔍 Starting COM Bridge detection and initialization...");

    // Re-detect COM Bridge availability
    this.detectComBridge();

    // If not immediately available, wait a moment for connection to establish
    if (!this.isAvailable) {
      console.log("⏳ Waiting for COM Bridge connection to establish...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (this.isAvailable) {
      console.log("🧪 Testing COM Bridge connection...");
      const testResult = await this.testConnection();
      if (testResult) {
        console.log("✅ COM Bridge successfully initialized and ready");
        return true;
      } else {
        console.warn("❌ COM Bridge detected but connection test failed");
        this.isAvailable = false;
        return false;
      }
    }

    console.log("❌ COM Bridge not available");
    return false;
  }
}

// Export singleton instance
export const comBridge = ComBridgeConnection.getInstance();
