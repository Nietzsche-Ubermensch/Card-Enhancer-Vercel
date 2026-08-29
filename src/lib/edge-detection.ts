import type { CropQuad } from "./types";
import { telemetry } from "./telemetry";
import { clamp } from "./utils";

export function detectCardEdges(
  image: HTMLImageElement | HTMLCanvasElement,
  targetAspectRatio: number | null = 2.5 / 3.5,
): CropQuad {
  const startTime = performance.now();
  const maxDimension = 600;
  const origW = image.width || 1;
  const origH = image.height || 1;
  const scale = Math.min(maxDimension / origW, maxDimension / origH, 1);
  const w = Math.floor(origW * scale);
  const h = Math.floor(origH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const defaultQuad = getInitialDefaultQuad(targetAspectRatio);
  if (!ctx) {
    telemetry.logEdgeDetectLatency(performance.now() - startTime);
    return defaultQuad;
  }
  try {
    ctx.drawImage(image, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
    }
    const gradients = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx =
          -1 * gray[idx - w - 1] +
          1 * gray[idx - w + 1] +
          -2 * gray[idx - 1] +
          2 * gray[idx + 1] +
          -1 * gray[idx + w - 1] +
          1 * gray[idx + w + 1];
        const gy =
          -1 * gray[idx - w - 1] -
          2 * gray[idx - w] -
          1 * gray[idx - w + 1] +
          1 * gray[idx + w - 1] +
          2 * gray[idx + w] +
          1 * gray[idx + w + 1];
        gradients[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    let topY = Math.floor(h * 0.08);
    for (let y = Math.floor(h * 0.05); y < Math.floor(h * 0.45); y++) {
      let lineGradSum = 0;
      for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) lineGradSum += gradients[y * w + x];
      if (lineGradSum / (w * 0.6) > 28) {
        topY = y;
        break;
      }
    }
    let bottomY = Math.floor(h * 0.92);
    for (let y = Math.floor(h * 0.95); y > Math.floor(h * 0.55); y--) {
      let lineGradSum = 0;
      for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) lineGradSum += gradients[y * w + x];
      if (lineGradSum / (w * 0.6) > 28) {
        bottomY = y;
        break;
      }
    }
    let leftX = Math.floor(w * 0.08);
    for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.45); x++) {
      let colGradSum = 0;
      for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) colGradSum += gradients[y * w + x];
      if (colGradSum / (h * 0.6) > 28) {
        leftX = x;
        break;
      }
    }
    let rightX = Math.floor(w * 0.92);
    for (let x = Math.floor(w * 0.95); x > Math.floor(w * 0.55); x--) {
      let colGradSum = 0;
      for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) colGradSum += gradients[y * w + x];
      if (colGradSum / (h * 0.6) > 28) {
        rightX = x;
        break;
      }
    }

    let normLeft = Math.max(0.02, leftX / w);
    let normRight = Math.min(0.98, rightX / w);
    let normTop = Math.max(0.02, topY / h);
    let normBottom = Math.min(0.98, bottomY / h);
    if (normRight - normLeft < 0.25 || normBottom - normTop < 0.25) {
      telemetry.logEdgeDetectLatency(performance.now() - startTime);
      return defaultQuad;
    }
    if (targetAspectRatio && targetAspectRatio > 0) {
      const currentW = (normRight - normLeft) * origW;
      const currentH = (normBottom - normTop) * origH;
      const currentRatio = currentW / currentH;
      if (currentRatio > targetAspectRatio) {
        const desiredW = (currentH * targetAspectRatio) / origW;
        const centerX = (normLeft + normRight) / 2;
        normLeft = Math.max(0.01, centerX - desiredW / 2);
        normRight = Math.min(0.99, centerX + desiredW / 2);
      } else {
        const desiredH = currentW / targetAspectRatio / origH;
        const centerY = (normTop + normBottom) / 2;
        normTop = Math.max(0.01, centerY - desiredH / 2);
        normBottom = Math.min(0.99, centerY + desiredH / 2);
      }
    }
    telemetry.logEdgeDetectLatency(performance.now() - startTime);
    return {
      topLeft: { x: clamp(normLeft, 0, 1), y: clamp(normTop, 0, 1) },
      topRight: { x: clamp(normRight, 0, 1), y: clamp(normTop, 0, 1) },
      bottomRight: { x: clamp(normRight, 0, 1), y: clamp(normBottom, 0, 1) },
      bottomLeft: { x: clamp(normLeft, 0, 1), y: clamp(normBottom, 0, 1) },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    telemetry.logError(`Edge detection failed: ${message}`, "EdgeDetection");
    telemetry.logEdgeDetectLatency(performance.now() - startTime);
    return defaultQuad;
  }
}

function getInitialDefaultQuad(aspectRatio: number | null): CropQuad {
  if (!aspectRatio) {
    return {
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.9 },
      bottomLeft: { x: 0.1, y: 0.9 },
    };
  }
  const cardW = 0.76;
  const marginX = clamp((1 - cardW) / 2, 0.05, 0.2);
  const cardH = Math.min(0.82, cardW / aspectRatio);
  const marginY = clamp((1 - cardH) / 2, 0.05, 0.2);
  return {
    topLeft: { x: marginX, y: marginY },
    topRight: { x: 1 - marginX, y: marginY },
    bottomRight: { x: 1 - marginX, y: 1 - marginY },
    bottomLeft: { x: marginX, y: 1 - marginY },
  };
}
