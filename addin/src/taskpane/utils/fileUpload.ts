/**
 * File upload utilities for audio samples
 */

/**
 * Validate audio file before upload
 * @param file - File to validate
 * @throws Error if validation fails
 */
export async function validateAudioFile(file: File): Promise<void> {
  // Check file size (10MB max)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error("File too large (max 10MB)");
  }

  // Check format
  const validFormats = ["audio/wav", "audio/mp3", "audio/mpeg"];
  if (!validFormats.includes(file.type)) {
    throw new Error("Invalid format (only WAV, MP3, or M4A)");
  }

  // Check duration using HTML5 Audio API
  const duration = await getAudioDuration(file);
  if (duration < 5) {
    throw new Error("Audio too short (min 5 seconds)");
  }
  if (duration > 600) {
    throw new Error("Audio too long (max 10 minutes)");
  }
}

/**
 * Get audio duration from file
 * @param file - Audio file
 * @returns Promise resolving to duration in seconds
 */
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener("loadedmetadata", () => {
      resolve(audio.duration);
    });
    audio.addEventListener("error", () => {
      reject(new Error("Failed to load audio file"));
    });
    audio.src = URL.createObjectURL(file);
  });
}

/**
 * Convert file to base64 string
 * @param file - File to convert
 * @returns Promise resolving to base64 string (without data URL prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/wav;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
