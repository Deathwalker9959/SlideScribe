/* global PowerPoint */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@ui/button';
import {
  Download,
  Play,
  Settings,
  Volume2,
  FileAudio,
  FileVideo,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  X,
} from 'lucide-react';

type SlideScript = {
  slideId: string;
  slideIndex: number;
  title: string;
  speakerNotes: string;
  extractedText: string;
  combinedText: string;
  generatedScript?: string;
  narrationAudioUrl?: string;
  narrationDuration?: number;
  wordsPerMinute?: number;
  audioJobId?: string;
  subtitles?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
};

type VoiceSettingsValue = {
  voice: string;
  speed: number;
  pitch: number;
  language: string;
  model?: string;
  provider?: string;
};

type AudioExport = {
  format: string;
  path?: string;
  downloadUrl?: string;
  fileSize?: number;
  duration?: number;
  createdAt: string;
};

type ExportPanelProps = {
  slideScripts: SlideScript[];
  voiceSettings: VoiceSettingsValue;
  jobAudioExports: AudioExport[];
  onEmbedNarration: () => Promise<void>;
  fetchJobAudioExports: (jobId: string) => Promise<void>;
};

declare global {
  interface Window {
    __SLIDESCRIBE_BACKEND_URL__?: string;
  }
}

const buildBackendHttpUrl = (path: string): string => {
  if (typeof window !== 'undefined' && window.__SLIDESCRIBE_BACKEND_URL__) {
    const baseUrl = window.__SLIDESCRIBE_BACKEND_URL__.replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }
  return `http://localhost:8000${path}`;
};

const resolveDownloadUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (typeof window === 'undefined') return url;

  try {
    const candidate = new URL(url, window.location.origin);
    if (!candidate.protocol.startsWith('http')) {
      return undefined;
    }
    return candidate.href;
  } catch {
    return undefined;
  }
};

export const ExportPanel: React.FC<ExportPanelProps> = ({
  slideScripts,
  voiceSettings,
  jobAudioExports,
  onEmbedNarration,
  fetchJobAudioExports,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: 'idle' | 'exporting' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [selectedExportFormat, setSelectedExportFormat] = useState<'mp4' | 'pptx'>('mp4');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string>('');
  const [audioExports, setAudioExports] = useState<AudioExport[]>([]);

  // Initialize audio exports from props
  useEffect(() => {
    setAudioExports(jobAudioExports);
  }, [jobAudioExports]);

  // Find active job ID from slide scripts
  useEffect(() => {
    const scriptWithJob = slideScripts.find(script => script.audioJobId);
    if (scriptWithJob?.audioJobId) {
      setActiveJobId(scriptWithJob.audioJobId);
      fetchJobAudioExports(scriptWithJob.audioJobId);
    }
  }, [slideScripts, fetchJobAudioExports]);

  const handleExport = useCallback(async () => {
    if (!activeJobId) {
      setExportStatus({
        type: 'error',
        message: 'No narration job found. Please generate narration first.',
      });
      return;
    }

    setIsExporting(true);
    setExportStatus({ type: 'exporting', message: 'Starting export...' });

    try {
      const requestUrl = buildBackendHttpUrl('/api/v1/narration/export');
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: activeJobId,
          exportFormat: selectedExportFormat,
          includeSubtitles,
          voiceSettings,
        }),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const result = await response.json();

      setExportStatus({
        type: 'success',
        message: `Export completed successfully! ${result.fileSize ? `File size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB` : ''}`,
      });

      // Refresh audio exports if there are new ones
      if (result.downloadUrl) {
        await fetchJobAudioExports(activeJobId);
      }
    } catch (error) {
      setExportStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  }, [activeJobId, selectedExportFormat, includeSubtitles, voiceSettings, fetchJobAudioExports]);

  const handleEmbedNarration = useCallback(async () => {
    setIsExporting(true);
    setExportStatus({ type: 'exporting', message: 'Embedding narration...' });

    try {
      await onEmbedNarration();
      setExportStatus({
        type: 'success',
        message: 'Narration embedded successfully!',
      });
    } catch (error) {
      setExportStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Embedding failed',
      });
    } finally {
      setIsExporting(false);
    }
  }, [onEmbedNarration]);

  const handleDownload = useCallback(async (exportInfo: AudioExport) => {
    const url = resolveDownloadUrl(exportInfo.downloadUrl || exportInfo.path);
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `narration.${exportInfo.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, []);

  const hasNarration = slideScripts.some(script => script.narrationAudioUrl);
  const totalDuration = slideScripts.reduce((sum, script) => sum + (script.narrationDuration || 0), 0);

  return (
    <div className="narration-view narration-view--export">
      <div className="export-panel">
        <div className="export-panel__header">
          <div className="export-panel__title">
            <Download className="export-panel__icon" />
            <h2>Export Narration</h2>
          </div>

          {exportStatus.type !== 'idle' && (
            <div className={`export-panel__status export-panel__status--${exportStatus.type}`}>
              {exportStatus.type === 'exporting' && <Loader2 className="export-panel__status-icon" />}
              {exportStatus.type === 'success' && <CheckCircle className="export-panel__status-icon" />}
              {exportStatus.type === 'error' && <AlertCircle className="export-panel__status-icon" />}
              <span className="export-panel__status-message">{exportStatus.message}</span>
              {exportStatus.type !== 'exporting' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExportStatus({ type: 'idle', message: '' })}
                  className="export-panel__status-dismiss"
                >
                  <X className="export-panel__status-icon" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Narration Summary */}
        <div className="export-panel__section">
          <h3 className="export-panel__section-title">Narration Summary</h3>
          <div className="export-summary">
            <div className="export-summary__row">
              <span className="export-summary__label">Slides with narration:</span>
              <span className="export-summary__value">
                {slideScripts.filter(script => script.narrationAudioUrl).length} / {slideScripts.length}
              </span>
            </div>
            <div className="export-summary__row">
              <span className="export-summary__label">Total duration:</span>
              <span className="export-summary__value">
                {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>
            <div className="export-summary__row">
              <span className="export-summary__label">Voice:</span>
              <span className="export-summary__value">{voiceSettings.voice}</span>
            </div>
            <div className="export-summary__row">
              <span className="export-summary__label">Language:</span>
              <span className="export-summary__value">{voiceSettings.language}</span>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="export-panel__section">
          <h3 className="export-panel__section-title">Export Options</h3>
          <div className="export-options">
            <div className="export-options__row">
              <label className="export-options__radio-label">
                <input
                  type="radio"
                  name="exportFormat"
                  value="mp4"
                  checked={selectedExportFormat === 'mp4'}
                  onChange={(e) => setSelectedExportFormat(e.target.value as 'mp4')}
                />
                <FileVideo className="export-options__icon" />
                <span className="export-options__label-text">
                  <strong>MP4 Video</strong>
                  <small>Combined audio and video export</small>
                </span>
              </label>
            </div>
            <div className="export-options__row">
              <label className="export-options__radio-label">
                <input
                  type="radio"
                  name="exportFormat"
                  value="pptx"
                  checked={selectedExportFormat === 'pptx'}
                  onChange={(e) => setSelectedExportFormat(e.target.value as 'pptx')}
                />
                <Download className="export-options__icon" />
                <span className="export-options__label-text">
                  <strong>PowerPoint with Embedded Audio</strong>
                  <small>Enhanced PPTX with narration</small>
                </span>
              </label>
            </div>
            <div className="export-options__row">
              <label className="export-options__checkbox-label">
                <input
                  type="checkbox"
                  checked={includeSubtitles}
                  onChange={(e) => setIncludeSubtitles(e.target.checked)}
                />
                <span className="export-options__label-text">
                  Include subtitles/captions
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Export Actions */}
        <div className="export-panel__section">
          <h3 className="export-panel__section-title">Export Actions</h3>
          <div className="export-actions">
            <Button
              onClick={handleExport}
              disabled={!hasNarration || isExporting}
              className="export-actions__primary"
            >
              {isExporting ? (
                <>
                  <Loader2 className="export-actions__icon" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="export-actions__icon" />
                  Export {selectedExportFormat.toUpperCase()}
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleEmbedNarration}
              disabled={!hasNarration || isExporting}
              className="export-actions__secondary"
            >
              <Volume2 className="export-actions__icon" />
              Embed in Current Deck
            </Button>
          </div>
        </div>

        {/* Available Downloads */}
        {audioExports.length > 0 && (
          <div className="export-panel__section">
            <h3 className="export-panel__section-title">Available Downloads</h3>
            <div className="export-downloads">
              {audioExports.map((exportInfo, index) => {
                const resolvedUrl = resolveDownloadUrl(exportInfo.downloadUrl || exportInfo.path);
                return (
                  <div key={`export-${exportInfo.format}-${index}`} className="export-download__item">
                    <div className="export-download__info">
                      <FileAudio className="export-download__icon" />
                      <div className="export-download__details">
                        <span className="export-download__format">{exportInfo.format.toUpperCase()}</span>
                        {exportInfo.fileSize && (
                          <span className="export-download__size">
                            {(exportInfo.fileSize / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="export-download__actions">
                      {resolvedUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(exportInfo)}
                          className="export-download__button"
                        >
                          <Download className="export-download__button-icon" />
                        </Button>
                      ) : (
                        <span className="export-download__unavailable">Not available</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="export-panel__section export-panel__section--info">
          <div className="export-info">
            <Info className="export-info__icon" />
            <div className="export-info__content">
              <h4>Export Information</h4>
              <ul>
                <li><strong>MP4:</strong> Creates a video file with synchronized narration and slide transitions</li>
                <li><strong>PPTX:</strong> Generates an enhanced PowerPoint file with embedded audio and optional subtitles</li>
                <li><strong>Embed:</strong> Adds narration directly to your current presentation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};