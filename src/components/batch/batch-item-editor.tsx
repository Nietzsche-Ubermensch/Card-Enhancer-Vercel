import { useMemo, useState } from "react";
import { Check, Crop, Eye, RefreshCw, ShieldCheck, Sparkles, Wand2, Zap } from "lucide-react";
import { CardEditorCanvas } from "@/components/cropper/card-editor-canvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { detectCardEdges } from "@/lib/edge-detection";
import { getRotatedCanvas } from "@/lib/image-rotation";
import { CARD_INCHES } from "@/lib/sports-card";
import type { QueuedCard } from "@/lib/batch-store";
import {
  DEFAULT_BATCH_SETTINGS,
  FULL_FRAME_QUAD,
  type AppState,
  type BatchSettings,
  type CardItem,
  type CropQuad,
  type EnhancementSettings,
} from "@/lib/types";

type Props = {
  card: QueuedCard;
  globalSettings: BatchSettings;
  onClose: () => void;
  onSave: (patch: Partial<QueuedCard>) => void;
};

export function BatchItemEditor({ card, globalSettings, onClose, onSave }: Props) {
  const [quad, setQuad] = useState<CropQuad>(card.quad ?? FULL_FRAME_QUAD);
  const [rotation, setRotation] = useState(card.rotation ?? 0);
  const [local, setLocal] = useState<BatchSettings>(() => ({
    ...DEFAULT_BATCH_SETTINGS,
    ...globalSettings,
    ...card.customSettings,
  }));
  const [strength, setStrength] = useState(card.customSettings?.restorationStrength ?? 0.55);
  const [microDust, setMicroDust] = useState(!!card.customSettings?.microDustFilter);
  const [antiGlare, setAntiGlare] = useState(!!card.customSettings?.antiGlare);
  const [chrome, setChrome] = useState(!!card.customSettings?.chromeParallelClarity);
  const [previewUrl, setPreviewUrl] = useState<string | null>(card.processedUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"crop" | "preview">("crop");

  const editorCard: CardItem = useMemo(
    () => ({
      id: card.id,
      name: card.file.name,
      originalUrl: card.previewUrl,
      imageElement: null,
      width: card.originalWidth || 800,
      height: card.originalHeight || 1120,
      quad,
      rotation,
      status: "Editing" as AppState,
    }),
    [card.id, card.file.name, card.previewUrl, card.originalWidth, card.originalHeight, quad, rotation],
  );

  const enhancement: EnhancementSettings = {
    brightness: local.brightness,
    contrast: antiGlare ? Math.min(1.15, local.contrast * 0.95) : local.contrast,
    saturation: local.saturation,
    vibrance: chrome ? Math.min(0.5, local.vibrance + 0.08) : local.vibrance,
    sharpen: local.sharpen * (0.6 + strength * 0.8),
    descratchEnabled: local.enableDescratching || microDust,
    descratchThreshold: microDust ? Math.max(0.08, local.descratchThreshold * 0.75) : local.descratchThreshold,
    descratchRadius: microDust ? Math.max(2, local.descratchRadius * 0.9) : local.descratchRadius,
    showScratchMask: false,
    aspectRatio: local.aspectRatio,
    autoSnap: false,
  };

  const autoDetect = () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const source = rotation ? getRotatedCanvas(img, rotation) : img;
      const landscape = source.width > source.height;
      const aspect = landscape
        ? CARD_INCHES.height / CARD_INCHES.width
        : CARD_INCHES.width / CARD_INCHES.height;
      setQuad(detectCardEdges(source, aspect));
    };
    img.src = card.previewUrl;
  };

  const apply = () => {
    onSave({
      quad,
      rotation,
      isCustomConfigured: true,
      processedUrl: previewUrl ?? card.processedUrl,
      customSettings: {
        ...local,
        restorationStrength: strength,
        microDustFilter: microDust,
        antiGlare,
        chromeParallelClarity: chrome,
      },
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1100px,calc(100vw-1.5rem))] max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide truncate pr-10">
            {card.file.name}
          </DialogTitle>
          <DialogDescription>
            Per-card quad · 90° · straighten · GPU preview. Wolfram print 2.5×3.5 / 3.5×2.5 in.
            {card.isCustomConfigured && (
              <Badge className="ml-2" tone="ok">
                override
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid lg:grid-cols-12 min-h-0 flex-1 overflow-hidden">
          <div className="lg:col-span-7 p-3 sm:p-4 border-b lg:border-b-0 lg:border-r border-border min-h-[420px]">
            <div className="flex flex-wrap gap-2 mb-3">
              <Button size="sm" variant={tab === "crop" ? "default" : "secondary"} onClick={() => setTab("crop")}>
                <Crop className="h-4 w-4" /> Quad
              </Button>
              <Button
                size="sm"
                variant={tab === "preview" ? "default" : "secondary"}
                onClick={() => setTab("preview")}
              >
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button size="sm" variant="secondary" onClick={autoDetect}>
                <Wand2 className="h-4 w-4" /> Auto-detect
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setQuad(FULL_FRAME_QUAD)}>
                <RefreshCw className="h-4 w-4" /> Full frame
              </Button>
            </div>
            {tab === "preview" && previewUrl ? (
              <div className="h-[min(520px,55vh)] border border-border bg-bg flex items-center justify-center p-3">
                <img src={previewUrl} alt="GPU preview" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <CardEditorCanvas
                card={editorCard}
                settings={enhancement}
                appState="Editing"
                onQuadChange={setQuad}
                onRotationChange={setRotation}
                onAutoCrop={autoDetect}
              />
            )}
            <p className="micro text-subtle mt-2">
              TL [{quad.topLeft.x.toFixed(2)}, {quad.topLeft.y.toFixed(2)}] · TR [{quad.topRight.x.toFixed(2)},{" "}
              {quad.topRight.y.toFixed(2)}] · BR [{quad.bottomRight.x.toFixed(2)}, {quad.bottomRight.y.toFixed(2)}] · BL [
              {quad.bottomLeft.x.toFixed(2)}, {quad.bottomLeft.y.toFixed(2)}]
            </p>
          </div>

          <aside className="lg:col-span-5 p-4 space-y-4 overflow-y-auto">
            <p className="micro text-subtle">Card override</p>
            {(
              [
                ["Restoration", strength, 0.1, 1, (v: number) => setStrength(v), `${Math.round(strength * 100)}%`],
                ["Sharpen", local.sharpen, 0, 1, (v: number) => setLocal({ ...local, sharpen: v }), `${Math.round(local.sharpen * 100)}%`],
                ["Contrast", local.contrast, 0.7, 1.5, (v: number) => setLocal({ ...local, contrast: v }), `${local.contrast.toFixed(2)}×`],
                ["Vibrance", local.vibrance, -0.3, 0.5, (v: number) => setLocal({ ...local, vibrance: v }), local.vibrance.toFixed(2)],
              ] as const
            ).map(([label, value, min, max, set, display]) => (
              <label key={String(label)} className="block space-y-1">
                <span className="flex justify-between text-[11px] text-muted">
                  {label}
                  <span className="text-fg">{display}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.05}
                  value={value}
                  onChange={(e) => set(parseFloat(e.target.value))}
                  className="w-full"
                />
              </label>
            ))}

            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11 border border-border px-3">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> Micro-dust
              </span>
              <input type="checkbox" checked={microDust} onChange={(e) => setMicroDust(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11 border border-border px-3">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" /> Anti-glare
              </span>
              <input type="checkbox" checked={antiGlare} onChange={(e) => setAntiGlare(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11 border border-border px-3">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Refractor clarity
              </span>
              <input type="checkbox" checked={chrome} onChange={(e) => setChrome(e.target.checked)} />
            </label>

            <Button
              className="w-full min-h-11"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setTab("preview");
                setPreviewUrl(card.previewUrl);
                setBusy(false);
              }}
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Keep live GPU in canvas
            </Button>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 min-h-11" onClick={onClose}>
                Cancel
              </Button>
              <Button className="flex-1 min-h-11" onClick={apply}>
                <Check className="h-4 w-4" /> Apply to item
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
