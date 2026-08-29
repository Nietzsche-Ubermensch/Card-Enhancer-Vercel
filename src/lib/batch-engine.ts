import type { BatchSettings, CropQuad, EnhancementSettings } from "@/lib/types";
import { ProcessingStatus } from "@/lib/types";
import { detectCardEdges } from "@/lib/edge-detection";
import { getRotatedCanvas } from "@/lib/image-rotation";
import { WebGLCardRenderer } from "@/webgl/renderer";
import { CARD_INCHES, HF_BATCH_BACKEND, OUTPUT_PRESETS, type JsonlEntry, type OutputDpi } from "@/lib/sports-card";
import type { QueuedCard } from "@/lib/batch-store";


async function blobToDataUrl(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

async function hubRealEsrgan(
  blob: Blob,
  outW: number,
  outH: number,
  quality: number,
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
  const image = await blobToDataUrl(blob);
  const res = await fetch("/api/upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res) return { ok: false, error: "Hub unreachable" };
  const body = (await res.json().catch(() => null)) as { ok?: boolean; image?: string; error?: string } | null;
  if (!body?.ok || !body.image) return { ok: false, error: body?.error ?? `Hub ${res.status}` };
  const decoded = await decodeImage(body.image);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "print canvas failed" };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded, 0, 0, outW, outH);
  const next = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!next) return { ok: false, error: "print jpeg failed" };
  return { ok: true, blob: next };
}

function yieldFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function decodeImage(url: string): Promise<HTMLCanvasElement> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("decode failed");
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("decode failed");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function mergeEnhancement(global: BatchSettings, card: QueuedCard): EnhancementSettings {
  const custom = card.customSettings ?? {};
  const pick = <K extends keyof BatchSettings>(key: K): BatchSettings[K] =>
    (custom[key] as BatchSettings[K] | undefined) ?? global[key];

  let contrast = pick("contrast");
  let vibrance = pick("vibrance");
  let descratchEnabled = pick("enableDescratching");
  let descratchThreshold = pick("descratchThreshold");
  let descratchRadius = pick("descratchRadius");
  const antiGlare = pick("antiGlare");
  const chrome = pick("chromeParallelClarity");
  const microDust = pick("microDustFilter");
  if (antiGlare) contrast = Math.min(1.15, contrast * 0.95);
  if (chrome) vibrance = Math.min(0.5, vibrance + 0.08);
  if (microDust) {
    descratchEnabled = true;
    descratchThreshold = Math.max(0.08, descratchThreshold * 0.75);
    descratchRadius = Math.max(2, descratchRadius * 0.9);
  }
  const strength = pick("restorationStrength");
  const sharpen = pick("sharpen");
  return {
    brightness: pick("brightness"),
    contrast,
    saturation: pick("saturation"),
    vibrance,
    sharpen: sharpen * (0.6 + strength * 0.8),
    descratchEnabled,
    descratchThreshold,
    descratchRadius,
    showScratchMask: false,
    aspectRatio: pick("aspectRatio"),
    autoSnap: false,
  };
}

export type BatchRunOptions = {
  settings: BatchSettings;
  dpi: OutputDpi;
  resume: boolean;
  completedNames: Set<string>;
  onCard: (id: string, patch: Partial<QueuedCard>) => void;
  onLog: (msg: string) => void;
  shouldStop: () => boolean;
};

export async function runWebglBatch(cards: QueuedCard[], opts: BatchRunOptions): Promise<JsonlEntry[]> {
  const preset = OUTPUT_PRESETS[opts.dpi];
  const canvas = document.createElement("canvas");
  const renderer = new WebGLCardRenderer(canvas);
  if (!renderer.ready) throw new Error("WebGL 2 is required for batch enhance.");

  const entries: JsonlEntry[] = [];
  let processed = 0;
  let elapsed = 0;

  for (const card of cards) {
    if (opts.shouldStop()) break;
    if (opts.resume && (card.status === ProcessingStatus.Completed || opts.completedNames.has(card.file.name))) {
      opts.onLog(`skip ${card.file.name} (resume)`);
      continue;
    }

    opts.onCard(card.id, { status: ProcessingStatus.Processing, error: undefined });
    const t0 = performance.now();
    try {
      const decoded = await decodeImage(card.previewUrl);
      const img = card.rotation ? getRotatedCanvas(decoded, card.rotation) : decoded;
      const srcW = img.width;
      const srcH = img.height;
      const landscape = srcW > srcH;
      const outW = landscape ? preset.height : preset.width;
      const outH = landscape ? preset.width : preset.height;
      const aspect = landscape
        ? CARD_INCHES.height / CARD_INCHES.width
        : CARD_INCHES.width / CARD_INCHES.height;
      const cardEnhance = { ...mergeEnhancement(opts.settings, card), aspectRatio: aspect };
      const quad: CropQuad = card.quad
        ? card.quad
        : opts.settings.autoCrop
          ? detectCardEdges(img, aspect)
          : {
              topLeft: { x: 0, y: 0 },
              topRight: { x: 1, y: 0 },
              bottomRight: { x: 1, y: 1 },
              bottomLeft: { x: 0, y: 1 },
            };
      const quality = card.customSettings?.jpegQuality ?? opts.settings.jpegQuality;
      let blob = await renderer.exportBatchCard(img, quad, cardEnhance, outW, outH, "image/jpeg", quality);
      let backend: JsonlEntry["backend"] = "webgl";
      if (opts.settings.hubRealEsrgan) {
        const hub = await hubRealEsrgan(blob, outW, outH, quality);
        if (hub.ok) {
          blob = hub.blob;
          backend = "webgl+realesrgan";
          opts.onLog(`hub ${HF_BATCH_BACKEND.id} ×${HF_BATCH_BACKEND.scale} ${card.file.name}`);
        } else {
          opts.onLog(`hub skip ${card.file.name}: ${hub.error}`);
        }
      }
      const url = URL.createObjectURL(blob);
      if (card.processedUrl?.startsWith("blob:")) URL.revokeObjectURL(card.processedUrl);
      const ms = Math.round(performance.now() - t0);
      elapsed += ms;
      processed += 1;
      const remaining = cards.length - processed;
      const eta = processed > 0 ? Math.round((elapsed / processed) * remaining) : 0;
      opts.onCard(card.id, {
        status: ProcessingStatus.Completed,
        processedBlob: blob,
        processedUrl: url,
        ms,
        originalWidth: srcW,
        originalHeight: srcH,
      });
      const output = `enhanced/${card.file.name.replace(/\.[^/.]+$/, "")}_enhanced.jpg`;
      entries.push({
        input: card.file.name,
        output,
        success: true,
        ms,
        width: outW,
        height: outH,
        backend,
      });
      opts.onLog(`ok ${card.file.name}  ${ms}ms  eta ${Math.round(eta / 1000)}s`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      opts.onCard(card.id, { status: ProcessingStatus.Failed, error: message });
      entries.push({ input: card.file.name, output: "", success: false, error: message });
      opts.onLog(`err ${card.file.name}: ${message}`);
    }
    await yieldFrame();
  }

  return entries;
}
