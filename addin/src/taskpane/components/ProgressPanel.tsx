import React from 'react';
import { Button } from '@ui/button';
import { Card } from '@ui/card';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProgressSnapshot {
  jobId: string;
  status: string;
  currentStep: string;
  currentSlide: number;
  totalSlides: number;
  progress: number;
  estimatedTimeRemaining: number;
  message?: string | null;
  error?: string | null;
  receivedAt: string;
  contextualHighlights?: string[];
  imageReferences?: string[];
  contextualTransitions?: Record<string, string>;
  contextConfidence?: number | null;
}

interface ProgressPanelProps {
  jobIdInput: string;
  onJobIdChange: (value: string) => void;
  onStartTracking: (jobId?: string) => void;
  onStopTracking: () => void;
  connectionStatus: ConnectionStatus;
  activeJobId: string | null;
  latestUpdate: ProgressSnapshot | null;
  history: ProgressSnapshot[];
  lastError?: string | null;
}

const statusLabelMap: Record<ConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error',
};

const statusDotClassMap: Record<ConnectionStatus, string> = {
  disconnected: 'progress-panel__status-dot--offline',
  connecting: 'progress-panel__status-dot--connecting',
  connected: 'progress-panel__status-dot--online',
  error: 'progress-panel__status-dot--error',
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Calculating…';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export function ProgressPanel({
  jobIdInput,
  onJobIdChange,
  onStartTracking,
  onStopTracking,
  connectionStatus,
  activeJobId,
  latestUpdate,
  history,
  lastError,
}: ProgressPanelProps) {
  const progressPercent = latestUpdate ? Math.round((latestUpdate.progress ?? 0) * 100) : 0;
  const canTrack = jobIdInput.trim().length > 0;
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="progress-panel">
      <div className="progress-panel__header">
        <div>
          <h2 className="progress-panel__title">Narration Progress</h2>
          <p className="progress-panel__subtitle">
            Monitor real-time updates for queued narration jobs.
          </p>
        </div>
        <div className="progress-panel__status">
          <span className={`progress-panel__status-dot ${statusDotClassMap[connectionStatus]}`} />
          <span className="progress-panel__status-text">{statusLabelMap[connectionStatus]}</span>
        </div>
      </div>

      <Card className="progress-panel__card">
        <div className="progress-panel__form">
          <label htmlFor="progress-job-id" className="progress-panel__label">
            Job ID
          </label>
          <input
            id="progress-job-id"
            className="progress-panel__input"
            value={jobIdInput}
            onChange={(event) => onJobIdChange(event.target.value)}
            placeholder="Enter a job identifier"
            autoComplete="off"
          />
          <div className="progress-panel__actions">
            <Button
              size="sm"
              onClick={onStartTracking}
              disabled={!canTrack || connectionStatus === 'connecting'}
            >
              {isConnected && activeJobId ? 'Switch Job' : 'Track Job'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onStopTracking}
              disabled={!isConnected}
            >
              Disconnect
            </Button>
          </div>
          {lastError && (
            <div className="progress-panel__error">
              <span>{lastError}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="progress-panel__card">
        <div className="progress-panel__section">
          <div className="progress-panel__section-header">
            <h3>Current Status</h3>
            <span className="progress-panel__pill">
              {activeJobId ? `Tracking ${activeJobId}` : 'No job selected'}
            </span>
          </div>

          {latestUpdate ? (
            <>
              <div className="progress-panel__info-grid">
                <div>
                  <span className="progress-panel__info-label">Status</span>
                  <span className="progress-panel__info-value">{latestUpdate.status}</span>
                </div>
                <div>
                  <span className="progress-panel__info-label">Current Step</span>
                  <span className="progress-panel__info-value">{latestUpdate.currentStep}</span>
                </div>
                <div>
                  <span className="progress-panel__info-label">Slide</span>
                  <span className="progress-panel__info-value">
                    {latestUpdate.currentSlide}/{latestUpdate.totalSlides}
                  </span>
                </div>
                <div>
                  <span className="progress-panel__info-label">ETA</span>
                  <span className="progress-panel__info-value">
                    {formatDuration(latestUpdate.estimatedTimeRemaining)}
                  </span>
                </div>
              </div>

              <div className="progress-panel__progress">
                <div className="progress-panel__progress-bar">
                  <div
                    className="progress-panel__progress-bar-fill"
                    style={{ width: `${Math.max(0, Math.min(progressPercent, 100))}%` }}
                  />
                </div>
                <span className="progress-panel__progress-value">{progressPercent}%</span>
              </div>

              {latestUpdate.message && (
                <div className="progress-panel__message">
                  <strong>Message:</strong> {latestUpdate.message}
                </div>
              )}

              {latestUpdate.error && (
                <div className="progress-panel__error progress-panel__error--inline">
                  <strong>Error:</strong> {latestUpdate.error}
                </div>
              )}
              {(latestUpdate.contextualHighlights?.length ||
                latestUpdate.imageReferences?.length ||
                (latestUpdate.contextualTransitions &&
                  Object.keys(latestUpdate.contextualTransitions).length > 0)) && (
                <div className="progress-panel__context-block">
                  <div className="progress-panel__context-header">
                    <h4>Latest Contextual Insights</h4>
                    {typeof latestUpdate.contextConfidence === 'number' && (
                      <span className="progress-panel__context-confidence">
                        Confidence {Math.round(latestUpdate.contextConfidence * 100)}%
                      </span>
                    )}
                  </div>
                  {latestUpdate.contextualHighlights && latestUpdate.contextualHighlights.length > 0 && (
                    <div className="progress-panel__context-section">
                      <h5>Highlights</h5>
                      <ul>
                        {latestUpdate.contextualHighlights.map((highlight, index) => (
                          <li key={`latest-highlight-${index}`}>{highlight}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {latestUpdate.imageReferences && latestUpdate.imageReferences.length > 0 && (
                    <div className="progress-panel__context-section">
                      <h5>Visual References</h5>
                      <ul>
                        {latestUpdate.imageReferences.map((reference, index) => (
                          <li key={`latest-image-ref-${index}`}>{reference}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {latestUpdate.contextualTransitions &&
                    Object.keys(latestUpdate.contextualTransitions).length > 0 && (
                      <div className="progress-panel__context-section">
                        <h5>Context Cues</h5>
                        <ul>
                          {Object.entries(latestUpdate.contextualTransitions).map(([key, value]) => (
                            <li key={`latest-transition-${key}`}>
                              <span className="progress-panel__context-label">
                                {key.replace(/_/g, ' ')}:
                              </span>{' '}
                              {value}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </>
          ) : (
            <p className="progress-panel__empty">
              Start tracking a job to view its progress timeline.
            </p>
          )}
        </div>
      </Card>

      <Card className="progress-panel__card progress-panel__card--history">
        <div className="progress-panel__section">
          <div className="progress-panel__section-header">
            <h3>Recent Events</h3>
          </div>

          {history.length === 0 ? (
            <p className="progress-panel__empty">No progress updates received yet.</p>
          ) : (
            <div className="progress-panel__history">
              {history.map((event) => (
                <div key={`${event.jobId}-${event.receivedAt}-${event.progress}`} className="progress-panel__history-item">
                  <div className="progress-panel__history-header">
                    <span className="progress-panel__history-timestamp">
                      {formatTimestamp(event.receivedAt)}
                    </span>
                    <span className="progress-panel__history-step">{event.currentStep}</span>
                    <span className="progress-panel__history-slide">
                      Slide {event.currentSlide}/{event.totalSlides}
                    </span>
                  </div>
                  <div className="progress-panel__history-meta">
                    <span>Status: {event.status}</span>
                    <span>Progress: {Math.round(event.progress * 100)}%</span>
                    <span>ETA: {formatDuration(event.estimatedTimeRemaining)}</span>
                  </div>
                  {(event.contextualHighlights?.length ||
                    event.imageReferences?.length ||
                    (event.contextualTransitions && Object.keys(event.contextualTransitions).length > 0)) && (
                    <div className="progress-panel__history-context">
                      {typeof event.contextConfidence === 'number' && (
                        <span className="progress-panel__history-confidence">
                          Confidence {Math.round(event.contextConfidence * 100)}%
                        </span>
                      )}
                      {event.contextualHighlights && event.contextualHighlights.length > 0 && (
                        <ul>
                          {event.contextualHighlights.map((highlight, index) => (
                            <li key={`history-highlight-${event.receivedAt}-${index}`}>{highlight}</li>
                          ))}
                        </ul>
                      )}
                      {event.imageReferences && event.imageReferences.length > 0 && (
                        <ul>
                          {event.imageReferences.map((reference, index) => (
                            <li key={`history-image-ref-${event.receivedAt}-${index}`}>{reference}</li>
                          ))}
                        </ul>
                      )}
                      {event.contextualTransitions &&
                        Object.keys(event.contextualTransitions).length > 0 && (
                          <ul>
                            {Object.entries(event.contextualTransitions).map(([key, value]) => (
                              <li key={`history-transition-${event.receivedAt}-${key}`}>
                                <span className="progress-panel__context-label">
                                  {key.replace(/_/g, ' ')}:
                                </span>{' '}
                                {value}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  )}
                  {event.message && (
                    <div className="progress-panel__history-message">{event.message}</div>
                  )}
                  {event.error && (
                    <div className="progress-panel__history-error">{event.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
