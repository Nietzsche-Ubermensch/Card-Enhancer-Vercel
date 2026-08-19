import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,
})

export type BatchStatus = 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'PARTIAL_SUCCESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type SourceStatus = 'UPLOADING' | 'VALIDATING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type CardStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type CardStage = 'VALIDATING' | 'DETECTING' | 'GEOMETRY' | 'RECTIFYING' | 'ORIENTING' | 'READY' | 'UPSCALING' | 'DESCRATCHING' | 'DESCRATCHING_UPSCALING' | 'EXPORTING' | 'COMPLETED' | 'FAILED' | 'RETRYING'
export type ArtifactType = 'ORIGINAL_SOURCE' | 'RECTIFIED' | 'UPSCALED' | 'DESCRATCHED' | 'DESCRATCHED_UPSCALED' | 'OPTIMIZED'
export type DescratchStrength = 'off' | 'low' | 'medium' | 'high'
export type BulkOperation = 'upscale' | 'descratch' | 'descratch_upscale' | 'retry'
export type ExportScope = 'current_card' | 'selected_cards' | 'all_completed'

export interface Point {
  x: number
  y: number
}

export interface ArtifactRecord {
  artifact_id: string
  card_id: string
  source_id: string
  artifact_type: ArtifactType
  parent_artifact_id?: string | null
  width: number
  height: number
  format: string
  created_at: string
  processing_version: string
  processing_parameters: Record<string, unknown>
  relative_path: string
  download_url: string
  preview_url?: string | null
  thumbnail_url?: string | null
  warnings: string[]
}

export interface SourceRecord {
  source_id: string
  batch_id: string
  original_filename: string
  safe_filename: string
  content_hash: string
  mime_type: string
  width: number
  height: number
  byte_size: number
  status: SourceStatus
  detected_card_count: number
  created_at: string
  error_code?: string | null
  error_message?: string | null
  original_relative_path: string
  warnings: string[]
}

export interface CardRecord {
  card_id: string
  batch_id: string
  source_id: string
  source_index: number
  display_index: number
  detector_method: string
  detection_confidence: number
  polygon: Point[]
  corners: Point[]
  centroid: Point
  geometry_method: string
  geometry_confidence: number
  orientation_degrees: number
  orientation_confidence: number
  orientation_method: string
  manual_orientation_override?: number | null
  status: CardStatus
  current_stage: CardStage
  progress: number
  rectified_artifact_id?: string | null
  upscaled_artifact_id?: string | null
  descratched_artifact_id?: string | null
  descratched_upscaled_artifact_id?: string | null
  original_source_artifact_id?: string | null
  warnings: string[]
  error_code?: string | null
  error_message?: string | null
  retryable: boolean
  attempt_count: number
  created_at: string
  updated_at: string
  quality: Record<string, number>
}

export interface BatchRecord {
  batch_id: string
  status: BatchStatus
  source_count: number
  detected_card_count: number
  queued_count: number
  processing_count: number
  completed_count: number
  failed_count: number
  cancelled_count: number
  progress: number
  created_at: string
  updated_at: string
  source_ids: string[]
  card_ids: string[]
}

export interface BatchStateResponse {
  batch: BatchRecord
  sources: SourceRecord[]
  cards: CardRecord[]
}

export interface CardDetailResponse {
  card: CardRecord
  source: SourceRecord
  artifacts: Record<string, ArtifactRecord | null>
}

export interface OperationAcceptedResponse {
  accepted: boolean
  message: string
  batch_id?: string | null
  card_id?: string | null
  source_ids: string[]
}

export interface ExportCardEntry {
  card_id: string
  source_id: string
  source_filename: string
  source_index: number
  output_filename: string
  artifact_type: string
  width: number
  height: number
  orientation: number
  detection_confidence: number
  geometry_confidence: number
  warnings: string[]
}

export interface ExportRecord {
  export_id: string
  batch_id: string
  status: string
  created_at: string
  updated_at: string
  scope: ExportScope
  artifact_type: ArtifactType
  format: string
  quality?: number | null
  card_ids: string[]
  manifest: {
    export_id: string
    created_at: string
    artifact_selection: string
    format: string
    card_count: number
    cards: ExportCardEntry[]
  }
  relative_path: string
  download_url: string
  error_message?: string | null
}

export const apiService = {
  async createBatch() {
    const response = await api.post<{ batch: BatchRecord }>('/api/batches')
    return response.data.batch
  },
  async addSources(batchId: string, files: File[]) {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await api.post<OperationAcceptedResponse>(`/api/batches/${batchId}/sources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
  async getBatch(batchId: string) {
    const response = await api.get<BatchStateResponse>(`/api/batches/${batchId}`)
    return response.data
  },
  async getCard(cardId: string) {
    const response = await api.get<CardDetailResponse>(`/api/cards/${cardId}`)
    return response.data
  },
  async rotateCard(cardId: string, degrees: 0 | 90 | 180 | 270) {
    const response = await api.post<OperationAcceptedResponse>(`/api/cards/${cardId}/orientation`, { degrees })
    return response.data
  },
  async requestUpscale(cardId: string, scale: 2 | 4) {
    const response = await api.post<OperationAcceptedResponse>(`/api/cards/${cardId}/upscale`, { scale })
    return response.data
  },
  async requestDescratch(cardId: string, strength: Exclude<DescratchStrength, 'off'>) {
    const response = await api.post<OperationAcceptedResponse>(`/api/cards/${cardId}/descratch`, { strength })
    return response.data
  },
  async requestDescratchUpscale(cardId: string, strength: Exclude<DescratchStrength, 'off'>, scale: 2 | 4) {
    const response = await api.post<OperationAcceptedResponse>(`/api/cards/${cardId}/descratch-upscale`, { strength, scale })
    return response.data
  },
  async retryCard(cardId: string) {
    const response = await api.post<OperationAcceptedResponse>(`/api/cards/${cardId}/retry`)
    return response.data
  },
  async processSelected(batchId: string, cardIds: string[], operation: BulkOperation, parameters: Record<string, unknown>) {
    const response = await api.post<OperationAcceptedResponse>(`/api/batches/${batchId}/process-selected`, {
      card_ids: cardIds,
      operation,
      parameters,
    })
    return response.data
  },
  async retryFailed(batchId: string) {
    const response = await api.post<OperationAcceptedResponse>(`/api/batches/${batchId}/retry-failed`)
    return response.data
  },
  async retrySource(sourceId: string) {
    const response = await api.post<OperationAcceptedResponse>(`/api/sources/${sourceId}/retry`)
    return response.data
  },
  async cancelSource(sourceId: string) {
    const response = await api.post<OperationAcceptedResponse>(`/api/sources/${sourceId}/cancel`)
    return response.data
  },
  async createExport(payload: {
    batch_id: string
    scope: ExportScope
    artifact_type: ArtifactType
    format: 'png' | 'jpg' | 'webp'
    quality?: number
    card_ids?: string[]
    current_card_id?: string
  }) {
    const response = await api.post<{ export: ExportRecord }>('/api/exports', payload)
    return response.data.export
  },
  async getExport(exportId: string) {
    const response = await api.get<{ export: ExportRecord }>(`/api/exports/${exportId}`)
    return response.data.export
  },
  getArtifactUrl(artifactId: string, variant: 'full' | 'preview' | 'thumbnail' = 'full') {
    return `${API_BASE_URL}/api/artifacts/${artifactId}/download?variant=${variant}`
  },
  getExportUrl(exportId: string) {
    return `${API_BASE_URL}/api/exports/${exportId}/download`
  },
  async healthCheck() {
    const response = await api.get<{ status: string; version: string }>('/health')
    return response.data
  },
}
