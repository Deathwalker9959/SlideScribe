import type { SlideAudioExport } from "../components/ScriptEditor";

export interface ProcessPresentationPayload {
  slides: Array<{
    slide_id: string;
    title: string;
    content: string;
    notes: string | null;
    images: Array<{
      image_id: string;
      description: string;
      mime_type: string;
      content_base64: string;
    }>;
  }>;
  settings: {
    provider: string;
    voice: string;
    speed: number;
    pitch: number;
    volume: number;
    tone: string;
    language: string;
  };
  metadata: {
    source: string;
    requested_at: string;
    presentation_id: string;
  };
}

export interface ProcessSlidePayload {
  presentation_id: string;
  presentation_title: string;
  slide_id: string;
  slide_number: number;
  slide_title: string;
  slide_content: string;
  slide_notes: string | null;
  slide_layout: string | null;
  images: Array<{
    image_id: string;
    description: string;
    mime_type: string;
    content_base64: string;
  }>;
  total_slides: number;
  topic_keywords: string[];
}

export interface RefineSlidePayload {
  text: string;
  refinement_type: "style" | "clarity" | "tone";
  language: string;
  tone: string;
}

export interface TTSSynthesizePayload {
  text: string;
  voice: string;
  driver: string;
  speed: number;
  pitch: number;
  volume: number;
  language: string;
  output_format: string;
}

/**
 * Service for backend narration API operations
 */
export class NarrationService {
  constructor(private baseUrl: string, private authToken: string = "test_token") {}

  /**
   * Build backend HTTP URL from path
   */
  private buildUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    const candidates = [
      typeof window !== "undefined" ? (window as any).__SLIDESCRIBE_BACKEND_URL__ : undefined,
      typeof window !== "undefined" ? window.location?.origin : undefined,
      "http://localhost:8000",
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate, typeof window !== "undefined" ? window.location.href : undefined);
        url.pathname = `${url.pathname.replace(/\/$/, "")}${normalizedPath}`;
        return url.toString();
      } catch (error) {
        console.warn("Unable to construct backend URL from candidate", candidate, error);
      }
    }

    return `${this.baseUrl}${normalizedPath}`;
  }

  /**
   * Process entire presentation for narration
   */
  async processPresentation(payload: ProcessPresentationPayload): Promise<{ job_id: string }> {
    const url = this.buildUrl("/api/v1/narration/process-presentation");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.job_id) {
      throw new Error("Backend response missing job ID");
    }

    return data;
  }

  /**
   * Process a single slide for contextual insights
   */
  async processSlide(payload: ProcessSlidePayload): Promise<any> {
    const url = this.buildUrl("/api/v1/narration/process-slide");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Context analysis failed with status ${response.status}`);
    }

    const data = await response.json();
    return data?.result ?? data;
  }

  /**
   * Refine slide script with AI
   */
  async refineSlide(payload: RefineSlidePayload): Promise<{ refined_text: string }> {
    const url = this.buildUrl("/api/v1/ai-refinement/refine");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Refinement failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Synthesize TTS audio
   */
  async synthesizeTTS(payload: TTSSynthesizePayload): Promise<{ audio_url?: string }> {
    const url = this.buildUrl("/api/v1/tts/synthesize");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`TTS synthesis failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get narration manifest for a job
   */
  async getManifest(jobId: string): Promise<any> {
    const url = this.buildUrl(`/api/v1/narration/manifest/${jobId}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Manifest fetch failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get audio exports for a job
   */
  async getAudioExports(jobId: string): Promise<SlideAudioExport[]> {
    const url = this.buildUrl(`/api/v1/audio/exports/${jobId}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Export list failed with status ${response.status}`);
    }

    const data = await response.json();
    return this.normalizeAudioExports(data);
  }

  /**
   * Get Office.js data for embedding
   */
  async getOfficeJsData(jobId: string): Promise<any> {
    const url = this.buildUrl(`/media/${jobId}/office_js_data.json`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Office.js data: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Backend error: ${data.error}`);
    }

    return data;
  }

  /**
   * Normalize audio exports response
   */
  private normalizeAudioExports(input: any): SlideAudioExport[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const format = (item.format ?? item.type ?? "").toString();
        if (!format) {
          return null;
        }
        return {
          format,
          path: item.export_path ?? item.path ?? "",
          fileSize: typeof item.file_size === "number" ? item.file_size : undefined,
          createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
          downloadUrl:
            typeof item.download_url === "string"
              ? item.download_url
              : typeof item.downloadUrl === "string"
                ? item.downloadUrl
                : undefined,
        } satisfies SlideAudioExport;
      })
      .filter((item): item is SlideAudioExport => Boolean(item));
  }

  /**
   * Resolve download URL for media files
   */
  resolveMediaUrl(url: string | undefined): string | undefined {
    if (!url) {
      return undefined;
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    if (url.startsWith("/")) {
      return this.buildUrl(url);
    }
    return this.buildUrl(`/${url}`);
  }
}
