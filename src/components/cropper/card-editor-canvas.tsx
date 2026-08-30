import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Compass, Grid, RefreshCw, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import type { AppState, CardItem, CropQuad, EnhancementSettings, Point } from "@/lib/types";
import { WebGLCardRenderer } from "@/webgl/renderer";
import { getRotatedCanvas, rotateQuad90Step } from "@/lib/image-rotation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clamp } from "@/lib/utils";

export type CardEditorHandle = { exportCard: () => Promise<void> };

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft" | "quad" | null;

interface Props {
  card: CardItem;
  settings: EnhancementSettings;
  appState: AppState;
  onQuadChange: (quad: CropQuad) => void;
  onRotationChange: (rotation: number) => void;
  onAutoCrop: () => void;
}

function containRect(cw: number, ch: number, iw: number, ih: number) {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

export const CardEditorCanvas = forwardRef<CardEditorHandle, Props>(function CardEditorCanvas(
  { card, settings, appState, onQuadChange, onRotationChange, onAutoCrop },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLCardRenderer | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const rotatedRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; quad: CropQuad } | null>(null);

  const [rotation, setRotation] = useState(card.rotation || 0);
  const [showGrid, setShowGrid] = useState(false);
  const [straighten, setStraighten] = useState(true);
  const [handle, setHandle] = useState<HandleKey>("topLeft");
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [imgSize, setImgSize] = useState({ width: card.width, height: card.height });

  useEffect(() => {
    setRotation(card.rotation || 0);
  }, [card.id, card.rotation]);

  useImperativeHandle(ref, () => ({
    exportCard: async () => {
      const source = rotatedRef.current;
      if (!rendererRef.current || !source) return;
      const blobUrl = await rendererRef.current.exportCroppedHighRes(source, card.quad, settings);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_enhanced.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
  }));

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = size.width;
    const h = size.height;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const box = containRect(w, h, imgSize.width || 1, imgSize.height || 1);
    if (showGrid) {
      ctx.strokeStyle = "rgba(138,160,173,0.14)";
      ctx.lineWidth = 1;
      for (let x = box.x; x <= box.x + box.w; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.h);
        ctx.stroke();
      }
      for (let y = box.y; y <= box.y + box.h; y += 36) {
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.stroke();
      }
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(138,160,173,0.4)";
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2, box.y);
      ctx.lineTo(box.x + box.w / 2, box.y + box.h);
      ctx.moveTo(box.x, box.y + box.h / 2);
      ctx.lineTo(box.x + box.w, box.y + box.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const map = (p: Point) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });
    const tl = map(card.quad.topLeft);
    const tr = map(card.quad.topRight);
    const br = map(card.quad.bottomRight);
    const bl = map(card.quad.bottomLeft);

    ctx.fillStyle = "rgba(9,9,11,0.62)";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill("evenodd");

    ctx.strokeStyle = "#8aa0ad";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = "rgba(242,242,244,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      const f = i / 3;
      ctx.moveTo(tl.x + (bl.x - tl.x) * f, tl.y + (bl.y - tl.y) * f);
      ctx.lineTo(tr.x + (br.x - tr.x) * f, tr.y + (br.y - tr.y) * f);
      ctx.moveTo(tl.x + (tr.x - tl.x) * f, tl.y + (tr.y - tl.y) * f);
      ctx.lineTo(bl.x + (br.x - bl.x) * f, bl.y + (br.y - bl.y) * f);
    }
    ctx.stroke();

    (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).forEach((key) => {
      const pt = map(card.quad[key]);
      const selected = handle === key;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, selected ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#d4d6db" : "#8aa0ad";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#09090b";
      ctx.stroke();
    });
  }, [card.quad, handle, size, showGrid, imgSize]);

  useEffect(() => {
    if (!webglCanvasRef.current) return;
    if (!rendererRef.current) rendererRef.current = new WebGLCardRenderer(webglCanvasRef.current);
    const img = new Image();
    if (/^https?:/i.test(card.originalUrl)) img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImageRef.current = img;
      const rotated = getRotatedCanvas(img, card.rotation || 0);
      rotatedRef.current = rotated;
      setImgSize({ width: rotated.width, height: rotated.height });
      rendererRef.current?.loadSourceImage(rotated);
      rendererRef.current?.render(settings);
      drawOverlay();
    };
    img.src = card.originalUrl;
  }, [card.id, card.originalUrl]);

  useEffect(() => {
    if (!baseImageRef.current) return;
    const rotated = getRotatedCanvas(baseImageRef.current, rotation);
    rotatedRef.current = rotated;
    setImgSize({ width: rotated.width, height: rotated.height });
    rendererRef.current?.loadSourceImage(rotated);
    rendererRef.current?.render(settings);
    drawOverlay();
  }, [rotation]);

  useEffect(() => {
    if (rotatedRef.current) rendererRef.current?.render(settings);
    drawOverlay();
  }, [settings, card.quad, size, showGrid, drawOverlay]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const setAngle = (next: number, rotateQuad = false, clockwise = true) => {
    const normalized = Math.round(((((next + 180) % 360) + 360) % 360 - 180) * 10) / 10;
    setRotation(normalized);
    onRotationChange(normalized);
    if (rotateQuad) onQuadChange(rotateQuad90Step(card.quad, clockwise));
  };

  const fine = (delta: number) => setAngle(rotation + delta, false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "[") {
        e.preventDefault();
        setAngle(rotation - 90, true, false);
      } else if (e.key === "]") {
        e.preventDefault();
        setAngle(rotation + 90, true, true);
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setShowGrid((v) => !v);
      } else if (e.altKey && e.code === "ArrowLeft") {
        e.preventDefault();
        fine(-0.5);
      } else if (e.altKey && e.code === "ArrowRight") {
        e.preventDefault();
        fine(0.5);
      } else if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setAngle(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotation, card.quad]);

  const pointerToNorm = (clientX: number, clientY: number) => {
    const canvas = overlayRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const box = containRect(size.width, size.height, imgSize.width || 1, imgSize.height || 1);
    return { mx, my, box };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = pointerToNorm(e.clientX, e.clientY);
    if (!hit) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const keys: HandleKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
    let clicked: HandleKey = "quad";
    for (const key of keys) {
      const pt = card.quad[key as keyof CropQuad] as Point;
      const x = hit.box.x + pt.x * hit.box.w;
      const y = hit.box.y + pt.y * hit.box.h;
      if (Math.hypot(hit.mx - x, hit.my - y) <= 22) {
        clicked = key;
        break;
      }
    }
    setHandle(clicked);
    dragRef.current = { x: hit.mx, y: hit.my, quad: structuredClone(card.quad) };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !handle) return;
    const hit = pointerToNorm(e.clientX, e.clientY);
    if (!hit) return;
    const dx = (hit.mx - dragRef.current.x) / hit.box.w;
    const dy = (hit.my - dragRef.current.y) / hit.box.h;
    const init = dragRef.current.quad;
    const next: CropQuad = structuredClone(card.quad);
    if (handle === "quad") {
      (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).forEach((k) => {
        next[k].x = clamp(init[k].x + dx, 0, 1);
        next[k].y = clamp(init[k].y + dy, 0, 1);
      });
    } else {
      next[handle].x = clamp(init[handle].x + dx, 0, 1);
      next[handle].y = clamp(init[handle].y + dy, 0, 1);
    }
    onQuadChange(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const fineValue = (() => {
    const m = rotation % 90;
    if (m > 45) return m - 90;
    if (m < -45) return m + 90;
    return m;
  })();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[420px] sm:min-h-[520px] overflow-hidden rounded-xl bg-bg border border-border select-none"
    >
      <canvas ref={webglCanvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 w-full h-full cursor-crosshair z-10 touch-none"
      />

      <div className="absolute top-3 left-3 z-20">
        <Badge tone={appState === "Ready" ? "ok" : "steel"}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {appState}
          <span className="text-subtle font-mono">
            {imgSize.width}×{imgSize.height}
          </span>
        </Badge>
      </div>

      <div className="absolute top-3 right-3 z-20 flex gap-1.5">
        <Button
          variant={showGrid ? "steel" : "secondary"}
          size="sm"
          onClick={() => setShowGrid((v) => !v)}
          title="Toggle grid (G)"
        >
          <Grid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Grid</span>
        </Button>
        <Button variant="steel" size="sm" onClick={onAutoCrop} title="Auto-detect (Space)">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Auto-crop</span>
        </Button>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 max-w-[calc(100%-8rem)]">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface/90 border border-border backdrop-blur-md">
          <Button variant="ghost" size="sm" onClick={() => setAngle(rotation - 90, true, false)} title="Rotate CCW ([)">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">-90°</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAngle(rotation + 90, true, true)} title="Rotate CW (])">
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">+90°</span>
          </Button>
          <Button variant={straighten ? "steel" : "ghost"} size="sm" onClick={() => setStraighten((v) => !v)}>
            <Compass className="h-3.5 w-3.5" />
            {rotation > 0 ? `+${rotation.toFixed(1)}°` : `${rotation.toFixed(1)}°`}
          </Button>
          {Math.abs(rotation) > 0.05 && (
            <Button variant="ghost" size="iconSm" onClick={() => setAngle(0)} title="Reset (Shift+R)">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {straighten && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface/95 border border-border text-xs font-mono">
            <button type="button" className="text-muted hover:text-fg" onClick={() => fine(-0.5)}>
              -0.5°
            </button>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.1}
              value={fineValue}
              onChange={(e) => {
                const base90 = Math.round(rotation / 90) * 90;
                setAngle(base90 + parseFloat(e.target.value));
              }}
              className="w-24 sm:w-32"
            />
            <button type="button" className="text-muted hover:text-fg" onClick={() => fine(0.5)}>
              +0.5°
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/90 border border-border text-[11px] font-mono text-muted">
        <span>
          Corner <strong className="text-fg">{handle || "topLeft"}</strong>
        </span>
        <span className="text-subtle">·</span>
        <span>
          <span className="kbd">[</span> <span className="kbd">]</span> rotate
        </span>
        <span className="text-subtle">·</span>
        <span>
          <span className="kbd">Shift</span> arrows nudge
        </span>
      </div>
    </div>
  );
});
