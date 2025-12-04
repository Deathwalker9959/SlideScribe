import React, { useState } from "react";
import { validateAudioFile, fileToBase64 } from "../utils/fileUpload";

interface VoiceUploadPanelProps {
  onVoiceCreated: (profileId: string) => void;
  onCancel: () => void;
  apiClient: any; // Will be typed properly when we update apiClient
}

export const VoiceUploadPanel: React.FC<VoiceUploadPanelProps> = ({
  onVoiceCreated,
  onCancel,
  apiClient,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      await validateAudioFile(selectedFile);
      setFile(selectedFile);
      setError(null);

      // Create preview URL
      const url = URL.createObjectURL(selectedFile);
      setAudioUrl(url);
    } catch (err: any) {
      setError(err.message);
      setFile(null);
      setAudioUrl(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !name) {
      setError("Please provide both a name and audio file");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const format = file.name.split(".").pop() || "wav";

      const response = await apiClient.uploadVoiceSample({
        name,
        description,
        audio_data_base64: base64,
        audio_format: format,
        language: "en-US",
      });

      onVoiceCreated(response.profile_id);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Cleanup audio URL on unmount
  React.useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <div className="voice-upload-panel">
      <h2 className="voice-upload-panel__title">Create Own Voice</h2>

      <div className="voice-upload-panel__guidelines">
        <h3>Voice Sample Guidelines</h3>
        <ul>
          <li>Duration: 5 seconds - 10 minutes</li>
          <li>Format: WAV or MP3</li>
          <li>Clear speech, minimal background noise</li>
          <li>Single speaker only</li>
        </ul>
      </div>

      <div className="voice-upload-panel__form">
        <div className="voice-upload-panel__field">
          <label htmlFor="voice-name" className="voice-upload-panel__label">
            Voice Name *
          </label>
          <input
            id="voice-name"
            type="text"
            placeholder="My Voice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="voice-upload-panel__name-input"
            disabled={uploading}
          />
        </div>

        <div className="voice-upload-panel__field">
          <label htmlFor="voice-description" className="voice-upload-panel__label">
            Description (optional)
          </label>
          <textarea
            id="voice-description"
            placeholder="Personal narration voice"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="voice-upload-panel__description-input"
            rows={3}
            disabled={uploading}
          />
        </div>

        <div className="voice-upload-panel__field">
          <label htmlFor="voice-file" className="voice-upload-panel__label">
            Audio File *
          </label>
          <input
            id="voice-file"
            type="file"
            accept="audio/wav,audio/mp3,.wav,.mp3"
            onChange={handleFileSelect}
            className="voice-upload-panel__file-input"
            disabled={uploading}
          />
        </div>

        {file && audioUrl && (
          <div className="voice-upload-panel__preview">
            <p className="voice-upload-panel__preview-filename">
              Selected: {file.name}
            </p>
            <audio controls src={audioUrl} className="voice-upload-panel__audio-player" />
          </div>
        )}

        {error && <div className="voice-upload-panel__error">{error}</div>}

        <div className="voice-upload-panel__actions">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="voice-upload-panel__btn voice-upload-panel__btn--cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !name || uploading}
            className="voice-upload-panel__btn voice-upload-panel__btn--upload"
          >
            {uploading ? "Uploading..." : "Create Voice"}
          </button>
        </div>
      </div>
    </div>
  );
};
