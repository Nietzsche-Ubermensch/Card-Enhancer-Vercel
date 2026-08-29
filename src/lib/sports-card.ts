/** Sports-card print geometry. Pixel sizes from Wolfram: 2.5 in × 3.5 in × dpi. */
export const CARD_INCHES = { width: 2.5, height: 3.5 } as const;
export const CARD_ASPECT = CARD_INCHES.width / CARD_INCHES.height;

export const OUTPUT_PRESETS = {
  300: { dpi: 300, width: 750, height: 1050, label: "300 dpi · 750×1050", mp: 0.7875, jpegMB: 0.2835, zip50MB: 14 },
  600: { dpi: 600, width: 1500, height: 2100, label: "600 dpi · 1500×2100", mp: 3.15, jpegMB: 1.134, zip50MB: 57 },
  1200: { dpi: 1200, width: 3000, height: 4200, label: "1200 dpi · 3000×4200", mp: 12.6, jpegMB: 4.536, zip50MB: 227 },
} as const;

export type OutputDpi = keyof typeof OUTPUT_PRESETS;

export const MAX_BATCH = 250;
export const MIN_BATCH_TARGET = 50;
export const LOG_STORAGE_KEY = "ces-enhancement-log";

/** Hugging Face recipe the WebGL queue is calibrated against (×2 Real-ESRGAN / RRDBNet). */
export const HF_BATCH_BACKEND = {
  id: "hlky/RealESRGAN_x2plus",
  url: "https://huggingface.co/hlky/RealESRGAN_x2plus",
  configUrl: "https://huggingface.co/hlky/RealESRGAN_x2plus/raw/main/config.json",
  apiUrl: "https://huggingface.co/api/models/hlky/RealESRGAN_x2plus",
  label: "RealESRGAN ×2",
  className: "RRDBNet",
  scale: 2,
  numBlock: 23,
  numFeat: 64,
  numGrowCh: 32,
  numInCh: 3,
  numOutCh: 3,
  weightsMb: 66.9,
  fp16Mb: 33.5,
  weightsFile: "diffusion_pytorch_model.safetensors",
  fp16File: "diffusion_pytorch_model.fp16.safetensors",
} as const;

export const HF_RRDBNET_CONFIG = {
  _class_name: "RRDBNet" as const,
  num_block: HF_BATCH_BACKEND.numBlock,
  num_feat: HF_BATCH_BACKEND.numFeat,
  num_grow_ch: HF_BATCH_BACKEND.numGrowCh,
  num_in_ch: HF_BATCH_BACKEND.numInCh,
  num_out_ch: HF_BATCH_BACKEND.numOutCh,
  scale: HF_BATCH_BACKEND.scale,
};

/** GitMCP-verified CLI from Nietzsche-Ubermensch/card-enhancer-suite gigapixel/batch.py. */
export const GIT_PIPELINE = {
  owner: "Nietzsche-Ubermensch",
  repo: "card-enhancer-suite",
  url: "https://github.com/Nietzsche-Ubermensch/card-enhancer-suite",
  fileUrl: "https://github.com/Nietzsche-Ubermensch/card-enhancer-suite/blob/main/gigapixel/batch.py",
  cli: "gigapixel-batch",
  resumeFlag: "--resume",
  resumeFn: "process_directory_resume",
  loadFn: "load_completed_inputs",
  log: "enhancement_log.jsonl",
  pattern: "*.jpg",
  suffix: "_enhanced",
  scale: "X2",
} as const;

export type JsonlEntry = {
  input: string;
  output: string;
  success: boolean;
  error?: string | null;
  ms?: number;
  width?: number;
  height?: number;
  backend?: "webgl" | "webgl+realesrgan";
};

export function loadCompletedInputs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return new Set();
    const completed = new Set<string>();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as JsonlEntry;
      if (entry.success && entry.input) completed.add(entry.input);
    }
    return completed;
  } catch {
    return new Set();
  }
}

export function readJsonlText(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LOG_STORAGE_KEY) ?? "";
}

export function clearJsonl() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOG_STORAGE_KEY);
}

export function zipBudgetMb(count: number, dpi: OutputDpi): number {
  return Math.round(OUTPUT_PRESETS[dpi].jpegMB * count * 10) / 10;
}

export function appendJsonl(entries: JsonlEntry[]) {
  if (typeof window === "undefined" || entries.length === 0) return;
  const prev = localStorage.getItem(LOG_STORAGE_KEY) ?? "";
  const next = `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
  try {
    localStorage.setItem(LOG_STORAGE_KEY, next);
  } catch {
    localStorage.setItem(LOG_STORAGE_KEY, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}
