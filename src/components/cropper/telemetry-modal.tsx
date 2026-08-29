import { useState } from "react";
import type { TelemetryPayload } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TelemetryModal({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: TelemetryPayload | null;
}) {
  const [copied, setCopied] = useState<"json" | "audit" | null>(null);
  if (!payload) return null;
  const jsonString = JSON.stringify(payload, null, 2);
  const audit = `You are an elite LLM Code Auditor. Review this WebGL card-enhancer telemetry. Identify root causes and output drop-in fixes.\n\n\`\`\`json\n${jsonString}\n\`\`\``;
  const copy = async (kind: "json" | "audit") => {
    await navigator.clipboard.writeText(kind === "json" ? jsonString : audit);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  };
  const rows = [
    ["FPS", String(payload.metrics.fps)],
    ["Frame time", `${payload.metrics.frameTimeMs} ms`],
    ["Edge detect", `${payload.metrics.edgeDetectTimeMs} ms`],
    ["Shader compile", `${payload.metrics.shaderCompileTimeMs} ms`],
    ["Export", `${payload.metrics.workerProcessingTimeMs} ms`],
    ["Context drops", String(payload.metrics.webglStateDrops)],
    ["Card", payload.activeCardName],
    ["Resolution", payload.resolution],
    ["Vendor", payload.webglVendor],
    ["Renderer", payload.webglRenderer],
    ["Memory", payload.memoryUsage ?? "N/A"],
    ["Last hotkey", payload.metrics.lastKeystroke],
    ["State", payload.appState],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>GPU telemetry</DialogTitle>
          <DialogDescription>Single-pass diagnostics · Ctrl+Shift+A</DialogDescription>
        </DialogHeader>
        <div className="p-5 overflow-y-auto space-y-2 font-mono text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/70 py-1.5">
              <span className="text-muted">{k}</span>
              <span className="text-right text-fg truncate max-w-[60%]">{v}</span>
            </div>
          ))}
          {payload.errors.length > 0 && (
            <div className="pt-3 space-y-1">
              <p className="text-danger">Recent errors</p>
              {payload.errors.slice(0, 6).map((err) => (
                <p key={err.id} className="text-muted">
                  [{err.source}] {err.message}
                </p>
              ))}
            </div>
          )}
          <pre className="mt-3 max-h-32 overflow-auto border border-border bg-bg p-2 text-[10px] text-muted">{jsonString}</pre>
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="secondary" className="flex-1 min-h-11" onClick={() => void copy("json")}>
              {copied === "json" ? "Copied JSON" : "Copy JSON"}
            </Button>
            <Button size="sm" className="flex-1 min-h-11" onClick={() => void copy("audit")}>
              {copied === "audit" ? "Copied audit" : "Copy audit prompt"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
