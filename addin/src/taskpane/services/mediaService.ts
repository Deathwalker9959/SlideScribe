/**
 * Media handling and conversion utilities
 */
export class MediaService {
  /**
   * Convert ArrayBuffer to base64 string
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Fetch audio file and convert to base64
   */
  static async fetchAudioAsBase64(audioUrl: string): Promise<string> {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return MediaService.arrayBufferToBase64(arrayBuffer);
  }

  /**
   * Read File as base64
   */
  static async readFileAsBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const [, encoded = ""] = result.split(",");
        resolve(encoded);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create image attachment object from file
   */
  static async createImageAttachment(
    slideId: string,
    file: File
  ): Promise<{
    id: string;
    name: string;
    mimeType: string;
    base64: string;
    size: number;
  }> {
    const base64 = await MediaService.readFileAsBase64(file);
    const id = `${slideId}-${Date.now()}`;

    return {
      id,
      name: file.name,
      mimeType: file.type || "image/png",
      base64,
      size: file.size,
    };
  }
}
