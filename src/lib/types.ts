export type AppState =
  | "Idle"
  | "Loading"
  | "Auto-Detecting"
  | "Editing"
  | "Processing"
  | "Ready";

export interface Point {
  x: number;
  y: number;
}

export interface CropQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface EnhancementSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  sharpen: number;
  descratchEnabled: boolean;
  descratchThreshold: number;
  descratchRadius: number;
  showScratchMask: boolean;
  aspectRatio: number | null;
  autoSnap: boolean;
}

export const DEFAULT_SETTINGS: EnhancementSettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1.08,
  vibrance: 0.16,
  sharpen: 0.32,
  descratchEnabled: true,
  descratchThreshold: 0.16,
  descratchRadius: 3.5,
  showScratchMask: false,
  aspectRatio: 2.5 / 3.5,
  autoSnap: true,
};

export interface TelemetryMetrics {
  fps: number;
  frameTimeMs: number;
  edgeDetectTimeMs: number;
  shaderCompileTimeMs: number;
  workerProcessingTimeMs: number;
  webglStateDrops: number;
  lastKeystroke: string;
  timestamp: string;
}

export interface TelemetryError {
  id: string;
  message: string;
  timestamp: string;
  source: string;
}

export interface TelemetryPayload {
  metrics: TelemetryMetrics;
  errors: TelemetryError[];
  appState: AppState;
  activeCardName: string;
  resolution: string;
  browserUserAgent: string;
  webglVendor: string;
  webglRenderer: string;
  memoryUsage?: string;
}

export interface CardItem {
  id: string;
  name: string;
  originalUrl: string;
  imageElement: HTMLImageElement | HTMLCanvasElement | null;
  width: number;
  height: number;
  quad: CropQuad;
  rotation?: number;
  processedBlobUrl?: string;
  status: AppState;
  isPreset?: boolean;
}

export enum ProcessingStatus {
  Pending = "Pending",
  Processing = "Processing",
  Completed = "Completed",
  Failed = "Failed",
}

export interface DamageIssue {
  type: string;
  description: string;
  severity: number;
  boundingBox: number[];
}

export interface AnalysisResult {
  damageScore: number;
  issues: string[];
  detailedIssues?: DamageIssue[];
  recommendedFixes: string[];
  boundingBox?: number[];
  gradeEstimate?: string;
}

export type { AIProvider } from "./ai/provider";
export { AI_PROVIDERS, ACTIVE_AI_PROVIDER } from "./ai/provider";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
}

export type ImageSize = "1K" | "2K";

export interface BatchSettings {
  aspectRatio: number;
  autoCrop: boolean;
  enableDescratching: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  sharpen: number;
  descratchThreshold: number;
  descratchRadius: number;
  restorationStrength: number;
  jpegQuality: number;
  microDustFilter: boolean;
  antiGlare: boolean;
  chromeParallelClarity: boolean;
}

export interface CardImage {
  id: string;
  file: File;
  previewUrl: string;
  processedUrl?: string;
  status: ProcessingStatus;
  originalWidth: number;
  originalHeight: number;
  analysis?: AnalysisResult;
  quad?: CropQuad;
  rotation?: number;
  customSettings?: Partial<BatchSettings> & {
    restorationStrength?: number;
    microDustFilter?: boolean;
    antiGlare?: boolean;
    chromeParallelClarity?: boolean;
  };
  isCustomConfigured?: boolean;
}

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  aspectRatio: 2.5 / 3.5,
  autoCrop: true,
  enableDescratching: true,
  brightness: 0,
  contrast: 1,
  saturation: 1.08,
  vibrance: 0.16,
  sharpen: 0.32,
  descratchThreshold: 0.16,
  descratchRadius: 3.5,
  restorationStrength: 0.55,
  jpegQuality: 0.92,
  microDustFilter: true,
  antiGlare: true,
  chromeParallelClarity: true,
};

export const STANDARD_QUAD: CropQuad = {
  topLeft: { x: 0.1125, y: 0.098 },
  topRight: { x: 0.8875, y: 0.098 },
  bottomRight: { x: 0.8875, y: 0.901 },
  bottomLeft: { x: 0.1125, y: 0.901 },
};

export const FULL_FRAME_QUAD: CropQuad = {
  topLeft: { x: 0.02, y: 0.02 },
  topRight: { x: 0.98, y: 0.02 },
  bottomRight: { x: 0.98, y: 0.98 },
  bottomLeft: { x: 0.02, y: 0.98 },
};
