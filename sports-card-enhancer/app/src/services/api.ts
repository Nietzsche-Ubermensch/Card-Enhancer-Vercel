import axios from 'axios';

// In production, set VITE_API_URL to the deployed backend origin.
// When unset and the app is served by the backend itself (same-origin
// deployment), fall back to the current origin instead of localhost.
const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin);

// Resolve a backend-relative path (e.g. "/outputs/x.zip") against the API base.
export const apiUrl = (path: string): string =>
  new URL(path, `${API_BASE_URL}/`).toString();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for large uploads
});

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface EnhancementSettings {
  blemish_removal: boolean;
  blemish_sensitivity: number;
  sharpening: boolean;
  sharpening_amount: number;
  color_correction: boolean;
  color_temperature: number;
  saturation: number;
  contrast_enhancement: boolean;
  contrast_amount: number;
  noise_reduction: boolean;
  noise_reduction_strength: number;
  upscaling: boolean;
  upscale_factor: number;
  preserve_holographic: boolean;
  output_format: 'png' | 'jpg' | 'webp' | 'tiff';
  output_quality: number;
  output_dpi: number;
}

export interface UploadResponse {
  job_id: string;
  status: JobStatus;
  message: string;
  total_files: number;
  accepted_files: number;
  rejected_files: number;
  rejected_reasons: string[];
}

export interface EnhancementResponse {
  job_id: string;
  status: JobStatus;
  message: string;
  estimated_time_seconds: number;
}

export type CardState =
  | 'queued' | 'validating' | 'processing' | 'completed'
  | 'failed' | 'retrying' | 'cancelled';

export interface CardImageInfo {
  id: string;
  filename: string;
  original_path: string;
  processed_path?: string;
  status: JobStatus;
  progress: number;
  card_state: CardState;
  detected_blemishes: any[];
  error_message?: string;
  orientation?: {
    orientation_degrees: number;
    orientation_confidence: number;
    orientation_method: string;
  } | null;
  crop_confidence?: number | null;
  metrics?: Record<string, number> | null;
  artifacts?: Record<string, string | null> | null;
  warnings?: string[];
  retry_count?: number;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: number;
  total_images: number;
  completed_images: number;
  failed_images: number;
  images: CardImageInfo[];
  created_at: string;
  updated_at: string;
}

export interface BatchProgress {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  progress: number;
}

export interface ExportResponse {
  job_id: string;
  download_url: string;
  file_count: number;
  total_size_bytes: number;
  manifest: Record<string, any>;
}

export interface DownloadResponse {
  job_id: string;
  download_url: string;
  expires_at: string;
  total_size_bytes: number;
  file_count: number;
}

export const apiService = {
  // Upload images
  async uploadImages(files: File[], settings?: EnhancementSettings): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (settings) {
      formData.append('settings_json', JSON.stringify(settings));
    }

    const response = await api.post<UploadResponse>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Start enhancement job
  async enhanceImages(files: File[], settings: EnhancementSettings): Promise<EnhancementResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('settings_json', JSON.stringify(settings));

    const response = await api.post<EnhancementResponse>('/enhance', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get job status
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await api.get<JobStatusResponse>(`/status/${jobId}`);
    return response.data;
  },

  // Get download URL
  async getDownloadUrl(jobId: string): Promise<DownloadResponse> {
    const response = await api.get<DownloadResponse>(`/download/${jobId}`);
    const data = response.data;
    // The backend returns a relative path; resolve it against the API base
    // so downloads work when frontend and backend are on different origins.
    if (data.download_url && !/^https?:\/\//i.test(data.download_url)) {
      data.download_url = apiUrl(data.download_url);
    }
    return data;
  },

  // Download file directly
  async downloadFile(jobId: string): Promise<Blob> {
    const response = await api.get(`/download/${jobId}/file`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Generate preview
  async generatePreview(file: File, settings: EnhancementSettings): Promise<Blob> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('settings_json', JSON.stringify(settings));

    const response = await api.post('/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      responseType: 'blob',
    });
    return response.data;
  },

  // Delete job
  async deleteJob(jobId: string): Promise<void> {
    await api.delete(`/jobs/${jobId}`);
  },

  // Process cards through the core pipeline (orientation/crop/optimize).
  async processCards(files: File[], options?: {
    manual_orientation?: number | null;
    output_format?: string;
    output_quality?: number;
    output_dpi?: number;
    aggressive?: boolean;
  }): Promise<EnhancementResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (options) {
      formData.append('process_json', JSON.stringify(options));
    }
    const response = await api.post<EnhancementResponse>('/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Retry failed cards in a job (all, or one card when cardId is given).
  async retryFailed(jobId: string, cardId?: string): Promise<{ requeued: number }> {
    const response = await api.post(`/jobs/${jobId}/retry`, null, {
      params: cardId ? { card_id: cardId } : {},
    });
    return response.data;
  },

  // Export selected cards, or all completed when imageIds omitted.
  async exportCards(jobId: string, imageIds?: string[]): Promise<ExportResponse> {
    const response = await api.post<ExportResponse>(`/jobs/${jobId}/export`, {
      image_ids: imageIds ?? null,
      format: 'zip',
    });
    const data = response.data;
    if (data.download_url && !/^https?:\/\//i.test(data.download_url)) {
      data.download_url = apiUrl(data.download_url);
    }
    return data;
  },

  // Aggregate batch progress.
  async getBatchProgress(jobId: string): Promise<BatchProgress> {
    const response = await api.get<BatchProgress>(`/jobs/${jobId}/progress`);
    return response.data;
  },

  // Which optional AI providers are configured (augmentation only).
  async getProviderStatus(): Promise<{ any_configured: boolean; configured_providers: string[] }> {
    const response = await api.get('/providers');
    return response.data;
  },

  // Manually override orientation for a job's cards (0/90/180/270) and reprocess.
  async setOrientation(jobId: string, degrees: 0 | 90 | 180 | 270): Promise<{ requeued: number }> {
    const response = await api.post(`/jobs/${jobId}/orientation`, null, {
      params: { degrees },
    });
    return response.data;
  },

  // Health check
  async healthCheck(): Promise<{ status: string; version: string }> {
    const response = await api.get('/health');
    return response.data;
  },
};

// WebSocket connection for real-time updates
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private jobId: string;
  private onMessage: (data: any) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(jobId: string, onMessage: (data: any) => void) {
    this.jobId = jobId;
    this.onMessage = onMessage;
  }

  connect() {
    const wsUrl = API_BASE_URL.replace('http', 'ws');
    this.ws = new WebSocket(`${wsUrl}/ws/${this.jobId}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.onMessage(data);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

export default apiService;
