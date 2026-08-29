import type { RefObject } from "react";
import { Eye, RefreshCw, ShieldCheck, Sliders, Sparkles } from "lucide-react";
import type { EnhancementSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import type { CardEditorHandle } from "./card-editor-canvas";

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-mono text-muted">
        <span>{label}</span>
        <span className="text-steel">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function ToolbarControls({
  settings,
  onChange,
  onReset,
  editorRef,
  onGrade,
  grading,
}: {
  settings: EnhancementSettings;
  onChange: (next: EnhancementSettings) => void;
  onReset: () => void;
  editorRef: RefObject<CardEditorHandle | null>;
  onGrade?: () => void;
  grading?: boolean;
}) {
  const set = <K extends keyof EnhancementSettings>(key: K, val: EnhancementSettings[K]) =>
    onChange({ ...settings, [key]: val });

  return (
    <div className="space-y-3">
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ok" />
            <h3 className="text-xs font-semibold tracking-wide">Surface descratch</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={settings.showScratchMask ? "steel" : "secondary"}
              size="sm"
              onClick={() => set("showScratchMask", !settings.showScratchMask)}
            >
              <Eye className="h-3.5 w-3.5" />
              Mask
            </Button>
            <button
              type="button"
              role="switch"
              aria-checked={settings.descratchEnabled}
              onClick={() => set("descratchEnabled", !settings.descratchEnabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${settings.descratchEnabled ? "bg-ok" : "bg-elevated border border-border"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-accent transition-transform ${settings.descratchEnabled ? "left-4" : "left-0.5"}`}
              />
            </button>
          </div>
        </div>
        {settings.descratchEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <SliderRow
              label="Sensitivity"
              value={settings.descratchThreshold}
              display={settings.descratchThreshold.toFixed(2)}
              min={0.05}
              max={0.4}
              step={0.01}
              onChange={(v) => set("descratchThreshold", v)}
            />
            <SliderRow
              label="Inpaint radius"
              value={settings.descratchRadius}
              display={`${settings.descratchRadius.toFixed(1)}px`}
              min={1}
              max={8}
              step={0.5}
              onChange={(v) => set("descratchRadius", v)}
            />
          </div>
        )}
      </div>

      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-steel" />
            <h3 className="text-xs font-semibold tracking-wide">Enhancements</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RefreshCw className="h-3 w-3" />
            Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SliderRow label="Sharpen" value={settings.sharpen} display={`${Math.round(settings.sharpen * 100)}%`} min={0} max={2} step={0.05} onChange={(v) => set("sharpen", v)} />
          <SliderRow label="Contrast" value={settings.contrast} display={`${Math.round(settings.contrast * 100)}%`} min={0.5} max={2} step={0.05} onChange={(v) => set("contrast", v)} />
          <SliderRow label="Saturation" value={settings.saturation} display={`${Math.round(settings.saturation * 100)}%`} min={0} max={2} step={0.05} onChange={(v) => set("saturation", v)} />
          <SliderRow label="Vibrance" value={settings.vibrance} display={`${Math.round(settings.vibrance * 100)}%`} min={0} max={1} step={0.05} onChange={(v) => set("vibrance", v)} />
          <SliderRow label="Brightness" value={settings.brightness} display={`${Math.round(settings.brightness * 100)}%`} min={-0.5} max={0.5} step={0.02} onChange={(v) => set("brightness", v)} />
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-muted">
              <span>Aspect</span>
              <span className="text-steel">{settings.aspectRatio ? "2.5×3.5" : "Free"}</span>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant={settings.aspectRatio ? "steel" : "secondary"}
                size="sm"
                className="flex-1"
                onClick={() => set("aspectRatio", 2.5 / 3.5)}
              >
                2.5×3.5
              </Button>
              <Button
                variant={!settings.aspectRatio ? "steel" : "secondary"}
                size="sm"
                className="flex-1"
                onClick={() => set("aspectRatio", null)}
              >
                Custom
              </Button>
            </div>
          </div>
        </div>
      </div>

      {onGrade && (
        <Button variant="secondary" className="w-full" onClick={onGrade} disabled={grading}>
          {grading ? "Grading…" : "AI grade this card"}
        </Button>
      )}

      <Button className="w-full h-11" onClick={() => editorRef.current?.exportCard()}>
        <Sparkles className="h-4 w-4" />
        Export enhanced PNG
      </Button>
    </div>
  );
}
