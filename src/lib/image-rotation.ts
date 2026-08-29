import type { CropQuad, Point } from "./types";

export function getRotatedCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  angleDegrees: number,
): HTMLCanvasElement {
  const origW = source.width || 1;
  const origH = source.height || 1;
  const normalized = ((angleDegrees % 360) + 540) % 360 - 180;
  if (Math.abs(normalized) < 0.001) {
    const canvas = document.createElement("canvas");
    canvas.width = origW;
    canvas.height = origH;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    return canvas;
  }
  const rad = (normalized * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const newW = Math.max(1, Math.round(origW * cos + origH * sin));
  const newH = Math.max(1, Math.round(origW * sin + origH * cos));
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(source, -origW / 2, -origH / 2);
  }
  return canvas;
}

export function rotateQuad90Step(quad: CropQuad, clockwise: boolean): CropQuad {
  const rotatePoint = (pt: Point): Point =>
    clockwise ? { x: 1 - pt.y, y: pt.x } : { x: pt.y, y: 1 - pt.x };
  if (clockwise) {
    return {
      topLeft: rotatePoint(quad.bottomLeft),
      topRight: rotatePoint(quad.topLeft),
      bottomRight: rotatePoint(quad.topRight),
      bottomLeft: rotatePoint(quad.bottomRight),
    };
  }
  return {
    topLeft: rotatePoint(quad.topRight),
    topRight: rotatePoint(quad.bottomRight),
    bottomRight: rotatePoint(quad.bottomLeft),
    bottomLeft: rotatePoint(quad.topLeft),
  };
}
