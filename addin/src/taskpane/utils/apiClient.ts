/**
 * Centralized API Client for SlideScribe Frontend
 * Handles authentication, request/response processing, and backend communication
 */

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Authentication Types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    username: string;
    email?: string;
  };
}

// Voice Settings Types
export interface VoiceSettings {
  provider: string;
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
  tone?: string;
  language: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  settings: VoiceSettings;
  created_at: string;
  updated_at: string;
  is_default?: boolean;
}

// Narration Job Types
export interface NarrationJob {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_slide: number;
  total_slides: number;
  current_step: string;
  estimated_time_remaining?: number;
  message?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface SlideData {
  slide_id: string;
  title: string;
  content: string;
  notes?: string;
  images?: SlideImage[];
}

export interface SlideImage {
  image_id: string;
  description: string;
  mime_type: string;
  content_base64?: string;
}

export interface NarrationRequest {
  slides: SlideData[];
  settings: VoiceSettings;
  metadata?: {
    source?: string;
    requested_at?: string;
    presentation_id?: string;
  };
}

// TTS Types
export interface TtsRequest {
  text: string;
  voice: string;
  driver?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  language?: string;
  output_format?: string;
  ssml?: string;
}

export interface TtsResponse {
  audio_url: string;
  duration?: number;
  file_size?: number;
  format: string;
}

// WebSocket Progress Types
export interface ProgressUpdate {
  job_id: string;
  status: string;
  progress: number;
  current_slide: number;
  total_slides: number;
  current_step: string;
  estimated_time_remaining?: number;
  message?: string;
  error?: string;
  result?: any;
  contextual_metadata?: any;
  audio_metadata?: any;
}

// API Client Class
export class SlideScribeApiClient {
  private baseUrl: string;
  private wsUrl: string;
  private authToken: string | null = null;
  private wsConnection: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    // Determine base URL from environment or fallback
    this.baseUrl = this.resolveBaseUrl();
    this.wsUrl = this.resolveWsUrl();
    
    // Load auth token from storage
    this.loadAuthToken();
  }

  private resolveBaseUrl(): string {
    // Check for global overrides first
    if (typeof window !== 'undefined') {
      if (window.__SLIDESCRIBE_BACKEND_URL__) {
        return window.__SLIDESCRIBE_BACKEND_URL__;
      }
      
      // Fallback to current origin or localhost
      const origin = window.location.origin;
      if (origin && !origin.includes('localhost')) {
        return origin;
      }
    }
    
    return 'http://localhost:8000';
  }

  private resolveWsUrl(): string {
    if (typeof window !== 'undefined') {
      if (window.__SLIDESCRIBE_PROGRESS_WS__) {
        return window.__SLIDESCRIBE_PROGRESS_WS__;
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:8000';
      return `${protocol}//${host}/ws/progress`;
    }
    
    return 'ws://localhost:8000/ws/progress';
  }

  private loadAuthToken(): void {
    if (typeof window !== 'undefined') {
      this.authToken = window.localStorage.getItem('slidescribe_auth_token');
    }
  }

  private saveAuthToken(token: string): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('slidescribe_auth_token', token);
      this.authToken = token;
    }
  }

  private clearAuthToken(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('slidescribe_auth_token');
      this.authToken = null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authentication header if token exists
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || data.detail || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Authentication Methods
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();
    
    if (data.access_token) {
      this.saveAuthToken(data.access_token);
    }

    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: 3600, // Default 1 hour
      user: {
        id: credentials.username,
        username: credentials.username,
      },
    };
  }

  async logout(): Promise<void> {
    try {
      // Backend doesn't have a logout endpoint, just clear token
      this.clearAuthToken();
      this.disconnectWebSocket();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  async getCurrentUser(): Promise<any> {
    if (!this.authToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.baseUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  }

  async refreshToken(): Promise<string | null> {
    // Backend doesn't have refresh endpoint, user needs to login again
    this.clearAuthToken();
    return null;
  }

  // Voice Settings Methods
  async getAvailableVoices(provider?: string): Promise<ApiResponse<any[]>> {
    const params = provider ? `?provider=${provider}` : '';
    return this.request(`/api/v1/tts/voices${params}`);
  }

  async getVoiceProfiles(): Promise<ApiResponse<VoiceProfile[]>> {
    return this.request('/api/v1/voice-profiles');
  }

  async createVoiceProfile(profile: Omit<VoiceProfile, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<VoiceProfile>> {
    return this.request('/api/v1/voice-profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  async updateVoiceProfile(id: string, profile: Partial<VoiceProfile>): Promise<ApiResponse<VoiceProfile>> {
    return this.request(`/api/v1/voice-profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  async deleteVoiceProfile(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/v1/voice-profiles/${id}`, {
      method: 'DELETE',
    });
  }

  // TTS Methods
  async synthesizeSpeech(request: TtsRequest): Promise<ApiResponse<TtsResponse>> {
    return this.request('/api/v1/tts/synthesize', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Narration Methods
  async createNarrationJob(request: NarrationRequest): Promise<ApiResponse<{ job_id: string }>> {
    return this.request('/api/v1/narration/process-presentation', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getNarrationJob(jobId: string): Promise<ApiResponse<NarrationJob>> {
    return this.request(`/api/v1/narration/job/${jobId}`);
  }

  async getNarrationManifest(jobId: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/narration/manifest/${jobId}`);
  }

  async cancelNarrationJob(jobId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/v1/narration/job/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  async processSlide(slideData: SlideData & { presentation_id?: string; presentation_title?: string; slide_number?: number; total_slides?: number; topic_keywords?: string[] }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/narration/process-slide', {
      method: 'POST',
      body: JSON.stringify(slideData),
    });
  }

  // AI Refinement Methods
  async refineText(text: string, refinementType: string, language?: string, tone?: string): Promise<ApiResponse<{ refined_text: string }>> {
    return this.request('/api/v1/ai-refinement/refine', {
      method: 'POST',
      body: JSON.stringify({
        text,
        refinement_type: refinementType,
        language,
        tone,
      }),
    });
  }

  // Subtitle Methods
  async generateSubtitles(jobId: string, format?: string): Promise<ApiResponse<any>> {
    const params = format ? `?format=${format}` : '';
    return this.request(`/api/v1/subtitles/generate/${jobId}${params}`);
  }

  async validateSubtitles(subtitleData: any): Promise<ApiResponse<any>> {
    return this.request('/api/v1/subtitles/validate', {
      method: 'POST',
      body: JSON.stringify(subtitleData),
    });
  }

  // Export Methods
  async exportAudio(jobId: string, format: string, options?: any): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/audio/export/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({
        format,
        ...options,
      }),
    });
  }

  async getAudioExports(jobId: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/v1/audio/exports/${jobId}`);
  }

  // Image Analysis Methods
  async analyzeImage(imageData: { image_id: string; description: string; mime_type: string; content_base64?: string }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/image-analysis/analyze', {
      method: 'POST',
      body: JSON.stringify(imageData),
    });
  }

  // Analytics Methods
  async trackEvent(event: string, data?: any): Promise<ApiResponse<void>> {
    return this.request('/api/v1/analytics/track', {
      method: 'POST',
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  async getAnalytics(filters?: any): Promise<ApiResponse<any>> {
    const params = filters ? `?${new URLSearchParams(filters).toString()}` : '';
    return this.request(`/api/v1/analytics${params}`);
  }

  // WebSocket Methods
  connectWebSocket(clientId: string, onMessage: (message: ProgressUpdate) => void, onError?: (error: Event) => void, onClose?: (event: CloseEvent) => void): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${this.wsUrl}?client_id=${clientId}`;
    this.wsConnection = new WebSocket(wsUrl);

    this.wsConnection.onopen = () => {
      console.log('WebSocket connected');
      this.wsReconnectAttempts = 0;
    };

    this.wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
      this.attemptReconnect(clientId, onMessage, onError, onClose);
    };

    this.wsConnection.onclose = (event) => {
      console.log('WebSocket closed:', event);
      onClose?.(event);
      if (!event.wasClean) {
        this.attemptReconnect(clientId, onMessage, onError, onClose);
      }
    };
  }

  private attemptReconnect(clientId: string, onMessage: (message: ProgressUpdate) => void, onError?: (error: Event) => void, onClose?: (event: CloseEvent) => void): void {
    if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.wsReconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.wsReconnectAttempts - 1);

    setTimeout(() => {
      console.log(`Attempting to reconnect (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
      this.connectWebSocket(clientId, onMessage, onError, onClose);
    }, delay);
  }

  disconnectWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.wsReconnectAttempts = 0;
  }

  subscribeToJob(jobId: string): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        action: 'subscribe',
        job_id: jobId
      }));
    }
  }

  unsubscribeFromJob(jobId: string): void {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        action: 'unsubscribe',
        job_id: jobId
      }));
    }
  }

  // Utility Methods
  getHealthStatus(): Promise<ApiResponse<any>> {
    return this.request('/health');
  }

  getServiceHealth(service: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/${service}/health`);
  }

  isAuthenticated(): boolean {
    return !!this.authToken;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }
}

// Create singleton instance
export const apiClient = new SlideScribeApiClient();

// Export types for use in components
export type {
  ApiResponse,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  VoiceSettings,
  VoiceProfile,
  NarrationJob,
  SlideData,
  SlideImage,
  NarrationRequest,
  TtsRequest,
  TtsResponse,
  ProgressUpdate,
};