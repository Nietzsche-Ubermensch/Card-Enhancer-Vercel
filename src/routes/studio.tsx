import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Keyboard, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { CardEditorCanvas, type CardEditorHandle } from "@/components/cropper/card-editor-canvas";
import { ToolbarControls } from "@/components/cropper/toolbar-controls";
import { PresetsBar } from "@/components/cropper/presets-bar";
import { ShortcutsModal } from "@/components/cropper/shortcuts-modal";
import { TelemetryModal } from "@/components/cropper/telemetry-modal";
import { GradePanel } from "@/components/cropper/grade-panel";
import type { AnalysisResult, AppState, CardItem, CropQuad, EnhancementSettings, TelemetryPayload } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getPresetCards } from "@/lib/presets";
import { detectCardEdges } from "@/lib/edge-detection";
import { getRotatedCanvas } from "@/lib/image-rotation";
import { telemetry } from "@/lib/telemetry";
import { analyzeCard } from "@/lib/ai";
import { urlToJpegBase64 } from "@/lib/image-encode";
import { clamp } from "@/lib/utils";

export const Route = createFileRoute("/studio")({ component: CropperPage });

function CropperPage() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [activeCardId, setActiveCardId] = useState("");
  const [appState, setAppState] = useState<AppState>("Ready");
  const [settings, setSettings] = useState<EnhancementSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem("card-enhancement-settings");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [payload, setPayload] = useState<TelemetryPayload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const editorRef = useRef<CardEditorHandle | null>(null);

  useEffect(() => {
    const presets = getPresetCards();
    setCards(presets);
    setActiveCardId(presets[0]?.id ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem("card-enhancement-settings", JSON.stringify(settings));
  }, [settings]);

  const activeCard = cards.find((c) => c.id === activeCardId) ?? cards[0];

  const handleAutoCrop = useCallback(() => {
    if (!activeCard) return;
    setAppState("Auto-Detecting");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const source = activeCard.rotation ? getRotatedCanvas(img, activeCard.rotation) : img;
      const detected = detectCardEdges(source, settings.aspectRatio);
      setCards((prev) => prev.map((c) => (c.id === activeCard.id ? { ...c, quad: detected } : c)));
      setAppState("Ready");
    };
    img.onerror = () => setAppState("Ready");
    img.src = activeCard.originalUrl;
  }, [activeCard, settings.aspectRatio]);

  const handleExport = useCallback(async () => {
    setAppState("Processing");
    try {
      await editorRef.current?.exportCard();
    } finally {
      setAppState("Ready");
    }
  }, []);

  const handleNudge = useCallback(
    (key: string, isShift: boolean) => {
      if (!activeCard) return;
      const step = isShift ? 0.015 : 0.002;
      let dx = 0;
      let dy = 0;
      if (key === "ArrowLeft") dx = -step;
      if (key === "ArrowRight") dx = step;
      if (key === "ArrowUp") dy = -step;
      if (key === "ArrowDown") dy = step;
      const q: CropQuad = structuredClone(activeCard.quad);
      (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).forEach((k) => {
        q[k].x = clamp(q[k].x + dx, 0, 1);
        q[k].y = clamp(q[k].y + dy, 0, 1);
      });
      setCards((prev) => prev.map((c) => (c.id === activeCard.id ? { ...c, quad: q } : c)));
    },
    [activeCard],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        if (activeCard) {
          setPayload(telemetry.getPayload(appState, activeCard.name, `${activeCard.width}x${activeCard.height}`));
          setAuditOpen(true);
        }
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handleAutoCrop();
        return;
      }
      if (e.code === "Enter") {
        e.preventDefault();
        void handleExport();
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        setSettings(DEFAULT_SETTINGS);
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code) && !e.altKey) {
        e.preventDefault();
        handleNudge(e.code, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAutoCrop, handleExport, handleNudge, activeCard, appState]);

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const item: CardItem = {
          id: Math.random().toString(36).slice(2, 9),
          name: file.name.replace(/\.[^/.]+$/, ""),
          originalUrl: url,
          imageElement: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          quad: {
            topLeft: { x: 0.1, y: 0.1 },
            topRight: { x: 0.9, y: 0.1 },
            bottomRight: { x: 0.9, y: 0.9 },
            bottomLeft: { x: 0.1, y: 0.9 },
          },
          status: "Ready",
        };
        setCards((prev) => [item, ...prev]);
        setActiveCardId(item.id);
        setAnalysis(null);
      };
    });
  }, []);

  const handleGrade = async () => {
    if (!activeCard) return;
    setGrading(true);
    try {
      const encoded = await urlToJpegBase64(activeCard.originalUrl);
      const result = await analyzeCard({
        data: { imageBase64: encoded.base64, mimeType: encoded.mimeType },
      });
      if (result.ok) setAnalysis(result.analysis);
    } finally {
      setGrading(false);
    }
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
      }}
      className="relative"
    >
      {dragging && (
        <div className="fixed inset-0 z-50 bg-bg/90 flex flex-col items-center justify-center pointer-events-none border-2 border-dashed border-steel">
          <Upload className="h-10 w-10 text-steel mb-3" />
          <p className="text-lg font-semibold">Drop card scans</p>
          <p className="text-sm text-muted">Local WebGL crop · descratch · enhance</p>
        </div>
      )}
      <AppShell
        title="Studio"
        subtitle="Perspective correction · WebGL descratch · surface polish"
        onOpenShortcuts={() => setShortcutsOpen(true)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setShortcutsOpen(true)}>
            <Keyboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hotkeys</span>
            <span className="kbd">?</span>
          </Button>
        }
      >
        <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
          <div className="hidden md:flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted px-1">
            <span className="flex items-center gap-1.5">
              <span className="kbd">Space</span> snap
            </span>
            <span className="flex items-center gap-1.5">
              <span className="kbd">Enter</span> export
            </span>
            <span className="flex items-center gap-1.5">
              <span className="kbd">G</span> grid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="kbd">Arrows</span> nudge
            </span>
          </div>
          {activeCard ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7">
                <div className="w-full aspect-[4/3] sm:aspect-[16/11]">
                  <CardEditorCanvas
                    ref={editorRef}
                    card={activeCard}
                    settings={settings}
                    appState={appState}
                    onQuadChange={(quad) =>
                      setCards((prev) => prev.map((c) => (c.id === activeCard.id ? { ...c, quad } : c)))
                    }
                    onRotationChange={(rotation) =>
                      setCards((prev) => prev.map((c) => (c.id === activeCard.id ? { ...c, rotation } : c)))
                    }
                    onAutoCrop={handleAutoCrop}
                  />
                </div>
              </div>
              <div className="lg:col-span-5 space-y-3">
                <ToolbarControls
                  settings={settings}
                  onChange={setSettings}
                  onReset={() => setSettings(DEFAULT_SETTINGS)}
                  editorRef={editorRef}
                  onGrade={handleGrade}
                  grading={grading}
                />
                {analysis && <GradePanel analysis={analysis} />}
              </div>
            </div>
          ) : (
            <div className="panel p-10 text-center text-muted">Loading bench…</div>
          )}
          <PresetsBar cards={cards} activeCardId={activeCardId} onSelectCard={(id) => { setActiveCardId(id); setAnalysis(null); }} onFileUpload={handleFileUpload} />
        </main>
      </AppShell>
      <ShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <TelemetryModal open={auditOpen} onOpenChange={setAuditOpen} payload={payload} />
    </div>
  );
}
