import React, { useEffect, useRef, useState } from "react";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import {
  Bug,
  FileText,
  Image as ImageIcon,
  Send,
  Download,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle,
  AlertCircle,
  Zap,
  Activity,
  Plug,
  Plug2,
} from "lucide-react";

/* global PowerPoint, Office */

interface SlideContent {
  slideNumber: number;
  title: string;
  text: string;
  shapes: number;
  layout: "title-only" | "title-and-content" | "complex";
  categories: Array<{ type: "title" | "bullet" | "body"; text: string }>;
}

interface ImageData {
  slideNumber: number;
  imageIndex: number;
  base64: string;
  format: string;
  width?: number;
  height?: number;
  name?: string;
}

const SAMPLE_PREVIEW_TEXT = "This is a debug narration preview.";

export function DebugPanel() {
  const [slideContent, setSlideContent] = useState<SlideContent[]>([]);
  const [images, setImages] = useState<ImageData[]>([]);
  const [apiEndpoint, setApiEndpoint] = useState(
    "http://localhost:8000/api/v1/narration/process-presentation"
  );
  const [apiResponse, setApiResponse] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [progressEvents, setProgressEvents] = useState<string[]>([]);
  const [socketStatus, setSocketStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const progressSocketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(`debug-panel-${Math.random().toString(36).slice(2, 8)}`);

  const [showTextSection, setShowTextSection] = useState(true);
  const [showImageSection, setShowImageSection] = useState(true);
  const [showApiSection, setShowApiSection] = useState(true);
  const [showNarrationSection, setShowNarrationSection] = useState(true);
  const [showWebsocketSection, setShowWebsocketSection] = useState(true);

  const buildBackendUrl = (path: string) => {
    try {
      const base =
        window.__SLIDESCRIBE_BACKEND_URL__ ?? window.location.origin ?? "http://localhost:8000";
      const url = new URL(base, window.location.href);
      url.pathname = `${url.pathname.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      return url.toString();
    } catch (err) {
      console.warn("Unable to build backend URL", err);
      return `http://localhost:8000${path}`;
    }
  };

  const buildProgressSocketUrl = (job: string) => {
    const base = window.__SLIDESCRIBE_PROGRESS_WS__ ?? buildBackendUrl("/ws/progress");
    const wsUrl = new URL(base, window.location.href);
    if (wsUrl.protocol.startsWith("http")) {
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    }
    wsUrl.searchParams.set("client_id", clientIdRef.current);
    if (job) {
      wsUrl.searchParams.set("job_id", job);
    }
    return wsUrl.toString();
  };

  const appendProgressEvent = (entry: string) => {
    setProgressEvents((current) => [entry, ...current].slice(0, 50));
  };

  const extractSlideText = async () => {
    setIsLoading(true);
    setError("");
    try {
      await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();

        const slideData: SlideContent[] = [];

        for (let i = 0; i < slides.items.length; i++) {
          const slide = slides.items[i];
          const shapes = slide.shapes;
          shapes.load(
            "items/type,items/name,items/width,items/height,items/textFrame/hasText,items/textFrame/textRange/text"
          );
          await context.sync();

          let slideText = "";
          let title = "";
          const categories: SlideContent["categories"] = [];

          shapes.items.forEach((shape, index) => {
            const hasText = shape.textFrame?.hasText;
            const text = hasText ? shape.textFrame!.textRange!.text.trim() : "";
            if (!text) {
              return;
            }

            if (!title && index === 0) {
              title = text;
              categories.push({ type: "title", text });
            } else {
              slideText += `${text}\n`;
              categories.push({ type: /^[-•*]/.test(text) ? "bullet" : "body", text });
            }
          });

          const layout: SlideContent["layout"] =
            shapes.items.length <= 2
              ? "title-only"
              : shapes.items.length <= 6
                ? "title-and-content"
                : "complex";

          slideData.push({
            slideNumber: i + 1,
            title: title || `Slide ${i + 1}`,
            text: slideText.trim(),
            shapes: shapes.items.length,
            layout,
            categories,
          });
        }

        setSlideContent(slideData);
      });
    } catch (err) {
      setError(`Error extracting text: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Error extracting slide text:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const extractImages = async () => {
    setIsLoading(true);
    setError("");
    try {
      await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();

        const imageData: ImageData[] = [];

        for (let i = 0; i < slides.items.length; i++) {
          const slide = slides.items[i];
          const shapes = slide.shapes;
          shapes.load("items/type,items/name,items/width,items/height");
          await context.sync();

          let imageCount = 0;
          shapes.items.forEach((shape) => {
            if (shape.type === "Image") {
              imageCount += 1;
              imageData.push({
                slideNumber: i + 1,
                imageIndex: imageCount,
                base64: "placeholder-base64-data",
                format: "png",
                width: shape.width,
                height: shape.height,
                name: shape.name,
              });
            }
          });
        }

        setImages(imageData);
        if (imageData.length === 0) {
          setError(
            "No images found in presentation. Note: image extraction has limited support in Office.js."
          );
        }
      });
    } catch (err) {
      setError(`Error extracting images: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Error extracting images:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendToBackend = async () => {
    if (!apiEndpoint) {
      setError("Please enter an API endpoint");
      return;
    }

    setIsLoading(true);
    setError("");
    setApiResponse("");

    try {
      const payload = {
        slides: slideContent,
        images,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(`API Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Error sending to backend:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadAsJson = () => {
    const data = {
      slides: slideContent,
      images,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slide-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startNarrationJob = async () => {
    setError("");
    setIsLoading(true);
    try {
      const slidesPayload = (
        slideContent.length
          ? slideContent
          : [
              {
                slideNumber: 1,
                title: "Debug Slide",
                text: "Sample narration content.",
                shapes: 1,
                layout: "title-only",
                categories: [{ type: "body", text: "Sample narration content." }],
              },
            ]
      ).map((slide) => ({
        slide_id: `debug-${slide.slideNumber}`,
        title: slide.title,
        content: slide.text,
        notes: null,
      }));

      const response = await fetch(buildBackendUrl("/api/v1/narration/process-presentation"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXZ1c2VyIn0.ifRuBeF3666cOR6oELX3NP1Z5RnCyk_Oe0J8yvqPCE4",
        },
        body: JSON.stringify({
          slides: slidesPayload,
          settings: {
            provider: "azure",
            voice: "en-US-AriaNeural",
            speed: 1.0,
            pitch: 0,
            volume: 1.0,
            tone: "professional",
            language: "en-US",
          },
          metadata: {
            source: "debug-panel",
            requested_at: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Narration request failed (${response.status})`);
      }

      const data = await response.json();
      setJobId(data.job_id ?? "");
      setJobStatus(data);
      appendProgressEvent(`Started job ${data.job_id}`);
    } catch (err) {
      setError(`Narration API error: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Narration job error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkJobStatus = async () => {
    if (!jobId) {
      setError("No job ID set. Start a job first.");
      return;
    }

    try {
      const response = await fetch(buildBackendUrl(`/api/v1/narration/status/${jobId}`), {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXZ1c2VyIn0.ifRuBeF3666cOR6oELX3NP1Z5RnCyk_Oe0J8yvqPCE4",
        },
      });
      if (!response.ok) {
        throw new Error(`Status check failed (${response.status})`);
      }
      const data = await response.json();
      setJobStatus(data);
      appendProgressEvent(`Status update: ${JSON.stringify(data.status ?? data)}`);
    } catch (err) {
      setError(`Status error: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Status check error", err);
    }
  };

  const connectProgressSocket = () => {
    if (!jobId) {
      setError("Enter a job ID before connecting to progress updates.");
      return;
    }

    try {
      setSocketStatus("connecting");
      const wsUrl = buildProgressSocketUrl(jobId);
      const socket = new WebSocket(wsUrl);
      progressSocketRef.current = socket;

      socket.onopen = () => {
        setSocketStatus("connected");
        socket.send(JSON.stringify({ action: "subscribe", job_id: jobId }));
        appendProgressEvent("WebSocket connected");
      };

      socket.onmessage = (event) => {
        appendProgressEvent(event.data);
      };

      socket.onerror = () => {
        setSocketStatus("error");
        appendProgressEvent("WebSocket error");
      };

      socket.onclose = () => {
        setSocketStatus("disconnected");
        appendProgressEvent("WebSocket disconnected");
      };
    } catch (err) {
      console.error("WebSocket connection error", err);
      setSocketStatus("error");
    }
  };

  const disconnectProgressSocket = () => {
    progressSocketRef.current?.close();
    progressSocketRef.current = null;
    setSocketStatus("disconnected");
  };

  useEffect(
    () => () => {
      disconnectProgressSocket();
    },
    []
  );

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <Bug className="debug-icon" />
        <h2 className="debug-title">Debug Panel</h2>
      </div>

      {error && (
        <div className="debug-error">
          <AlertCircle className="debug-error-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* Text Extraction Section */}
      <div className="debug-section">
        <div className="debug-section-header" onClick={() => setShowTextSection(!showTextSection)}>
          {showTextSection ? <ChevronDown /> : <ChevronRight />}
          <FileText className="debug-section-icon" />
          <span>Slide Text Extraction</span>
        </div>

        {showTextSection && (
          <div className="debug-section-content">
            <Button
              onClick={extractSlideText}
              disabled={isLoading}
              className="debug-action-btn"
              size="sm"
            >
              <FileText className="debug-btn-icon" />
              {isLoading ? "Extracting..." : "Extract All Slide Text"}
            </Button>

            {slideContent.length > 0 && (
              <>
                <div className="debug-stats">
                  <span className="debug-stat-badge">{slideContent.length} slides extracted</span>
                </div>

                <div className="debug-content-display">
                  {slideContent.map((slide) => (
                    <div key={slide.slideNumber} className="debug-slide-item">
                      <div className="debug-slide-header">
                        <strong>Slide {slide.slideNumber}</strong>
                        <span className="debug-slide-meta">
                          {slide.shapes} shapes · {slide.layout}
                        </span>
                      </div>
                      <div className="debug-slide-title">{slide.title}</div>
                      {slide.text && <pre className="debug-code-block">{slide.text}</pre>}
                      {slide.categories.length > 0 && (
                        <ul className="debug-slide-list">
                          {slide.categories.map((entry, idx) => (
                            <li key={idx}>
                              <span className={`debug-chip debug-chip--${entry.type}`}>
                                {entry.type}
                              </span>
                              {entry.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                <div className="debug-actions">
                  <Button
                    onClick={() => copyToClipboard(JSON.stringify(slideContent, null, 2))}
                    variant="outline"
                    size="sm"
                  >
                    {copied ? (
                      <CheckCircle className="debug-btn-icon" />
                    ) : (
                      <Copy className="debug-btn-icon" />
                    )}
                    {copied ? "Copied!" : "Copy JSON"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Image Extraction Section */}
      <div className="debug-section">
        <div
          className="debug-section-header"
          onClick={() => setShowImageSection(!showImageSection)}
        >
          {showImageSection ? <ChevronDown /> : <ChevronRight />}
          <ImageIcon className="debug-section-icon" />
          <span>Image Extraction</span>
        </div>

        {showImageSection && (
          <div className="debug-section-content">
            <Button
              onClick={extractImages}
              disabled={isLoading}
              className="debug-action-btn"
              size="sm"
            >
              <ImageIcon className="debug-btn-icon" />
              {isLoading ? "Extracting..." : "Extract Images"}
            </Button>

            {images.length > 0 && (
              <>
                <div className="debug-stats">
                  <span className="debug-stat-badge">{images.length} images found</span>
                </div>

                <div className="debug-content-display">
                  {images.map((img) => (
                    <div key={`${img.slideNumber}-${img.imageIndex}`} className="debug-image-item">
                      <div className="debug-image-header">
                        <strong>
                          Slide {img.slideNumber} · Image {img.imageIndex}
                        </strong>
                        <span className="debug-image-meta">{img.format}</span>
                      </div>
                      <div className="debug-image-meta-list">
                        {img.name && <span>Name: {img.name}</span>}
                        {img.width && img.height && (
                          <span>
                            {Math.round(img.width)} × {Math.round(img.height)} px
                          </span>
                        )}
                      </div>
                      <div className="debug-image-placeholder">
                        Image data available (base64 placeholder)
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* API Testing Section */}
      <div className="debug-section">
        <div className="debug-section-header" onClick={() => setShowApiSection(!showApiSection)}>
          {showApiSection ? <ChevronDown /> : <ChevronRight />}
          <Send className="debug-section-icon" />
          <span>Backend API Testing</span>
        </div>

        {showApiSection && (
          <div className="debug-section-content">
            <div className="debug-input-group">
              <label className="debug-label">API Endpoint</label>
              <Textarea
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="http://localhost:8000/api/v1/narration/process-presentation"
                className="debug-input"
                rows={2}
              />
            </div>

            <div className="debug-actions">
              <Button
                onClick={sendToBackend}
                disabled={isLoading || (slideContent.length === 0 && images.length === 0)}
                className="debug-action-btn"
                size="sm"
              >
                <Send className="debug-btn-icon" />
                {isLoading ? "Sending..." : "Send to Backend"}
              </Button>

              <Button
                onClick={downloadAsJson}
                disabled={slideContent.length === 0 && images.length === 0}
                variant="outline"
                size="sm"
              >
                <Download className="debug-btn-icon" />
                Download JSON
              </Button>
            </div>

            {apiResponse && (
              <div className="debug-response">
                <div className="debug-response-header">
                  <span>API Response</span>
                  <Button onClick={() => copyToClipboard(apiResponse)} variant="ghost" size="sm">
                    {copied ? <CheckCircle /> : <Copy />}
                  </Button>
                </div>
                <pre className="debug-code-block">{apiResponse}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Narration Job Section */}
      <div className="debug-section">
        <div
          className="debug-section-header"
          onClick={() => setShowNarrationSection(!showNarrationSection)}
        >
          {showNarrationSection ? <ChevronDown /> : <ChevronRight />}
          <Zap className="debug-section-icon" />
          <span>Narration Job Testing</span>
        </div>

        {showNarrationSection && (
          <div className="debug-section-content">
            <div className="debug-input-group">
              <label className="debug-label">Current Job ID</label>
              <Textarea
                value={jobId}
                onChange={(e) => setJobId(e.target.value.trim())}
                placeholder="Job ID"
                className="debug-input"
                rows={1}
              />
            </div>

            <div className="debug-actions">
              <Button
                onClick={startNarrationJob}
                disabled={isLoading}
                className="debug-action-btn"
                size="sm"
              >
                <Activity className="debug-btn-icon" />
                {isLoading ? "Starting..." : "Start Narration Job"}
              </Button>
              <Button onClick={checkJobStatus} disabled={!jobId} variant="outline" size="sm">
                Check Status
              </Button>
            </div>

            {jobStatus && (
              <div className="debug-response">
                <div className="debug-response-header">
                  <span>Latest Job Status</span>
                </div>
                <pre className="debug-code-block">{JSON.stringify(jobStatus, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* WebSocket Testing Section */}
      <div className="debug-section">
        <div
          className="debug-section-header"
          onClick={() => setShowWebsocketSection(!showWebsocketSection)}
        >
          {showWebsocketSection ? <ChevronDown /> : <ChevronRight />}
          <Plug className="debug-section-icon" />
          <span>Progress WebSocket</span>
        </div>

        {showWebsocketSection && (
          <div className="debug-section-content">
            <div className="debug-actions">
              <Button
                onClick={connectProgressSocket}
                disabled={!jobId || socketStatus === "connecting" || socketStatus === "connected"}
                className="debug-action-btn"
                size="sm"
              >
                <Plug2 className="debug-btn-icon" />
                {socketStatus === "connecting" ? "Connecting..." : "Connect"}
              </Button>
              <Button
                onClick={disconnectProgressSocket}
                variant="outline"
                size="sm"
                disabled={socketStatus === "disconnected"}
              >
                Disconnect
              </Button>
              <span className={`debug-chip debug-chip--${socketStatus}`}>
                Status: {socketStatus}
              </span>
            </div>

            {progressEvents.length > 0 && (
              <div className="debug-response">
                <div className="debug-response-header">
                  <span>Recent Events</span>
                </div>
                <pre className="debug-code-block debug-code-block--compact">
                  {progressEvents.join("\n")}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
