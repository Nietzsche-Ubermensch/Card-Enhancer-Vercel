import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, FileCode, FileSpreadsheet, FolderUp, Loader2, Pause, Play, Trash2, Upload, X, Zap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProcessingStatus, type BatchSettings } from "@/lib/types";
import { DEFAULT_BATCH_SETTINGS } from "@/lib/types";
import { generateTestCardFiles } from "@/lib/test-cards";
import { presetFiles } from "@/lib/presets";
import { downloadUrl, cn } from "@/lib/utils";
import {
  CARD_INCHES,
  GIT_PIPELINE,
  HF_BATCH_BACKEND,
  MAX_BATCH,
  MIN_BATCH_TARGET,
  OUTPUT_PRESETS,
  appendJsonl,
  clearJsonl,
  loadCompletedInputs,
  readJsonlText,
  zipBudgetMb,
  type OutputDpi,
} from "@/lib/sports-card";
import { filesToQueuedCards, useBatchStore, type QueuedCard } from "@/lib/batch-store";
import { runWebglBatch } from "@/lib/batch-engine";
import { getPipelineSnapshot, type PipelineSnapshot } from "@/lib/hub";
import { LINEAR_BOARD, linearCounts } from "@/lib/linear-board";
import { BatchItemEditor } from "@/components/batch/batch-item-editor";
import { BatchInspect } from "@/components/batch/batch-inspect";
import { buildManifestCsv, buildManifestJson } from "@/lib/manifest";

export function BatchWorkbench() {
  const cards = useBatchStore((s) => s.cards);
  const enqueue = useBatchStore((s) => s.enqueue);
  const patch = useBatchStore((s) => s.patch);
  const remove = useBatchStore((s) => s.remove);
  const clear = useBatchStore((s) => s.clear);
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS);
  const [dpi, setDpi] = useState<OutputDpi>(300);
  const [resume, setResume] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hasLog, setHasLog] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineSnapshot | null>(null);
  const [editing, setEditing] = useState<QueuedCard | null>(null);
  const [inspecting, setInspecting] = useState<QueuedCard | null>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const logsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    setHasLog(Boolean(readJsonlText()));
  }, [logs]);

  useEffect(() => {
    let cancelled = false;
    void getPipelineSnapshot()
      .then((snap) => {
        if (!cancelled) setPipeline(snap);
      })
      .catch((error) => {
        addLog(error instanceof Error ? `Pipeline status unavailable: ${error.message}` : "Pipeline status unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addLog = useCallback((msg: string) => {
    const t = new Date().toISOString().split("T")[1]?.split(".")[0] ?? "";
    setLogs((prev) => [...prev.slice(-160), `[${t}] ${msg}`]);
  }, []);

  const queueFiles = useCallback(
    (list: FileList | File[]) => {
      const queued = filesToQueuedCards(list);
      const added = enqueue(queued);
      queued.slice(0, added).forEach((card) => {
        const img = new Image();
        img.onload = () => patch(card.id, { originalWidth: img.naturalWidth, originalHeight: img.naturalHeight });
        img.src = card.previewUrl;
      });
      const skipped = queued.length - added;
      addLog(`Queued ${added} · ${useBatchStore.getState().cards.length}/${MAX_BATCH}${skipped ? ` · skipped ${skipped} (capacity)` : ""}`);
    },
    [addLog, enqueue],
  );

  const loadSamples = useCallback(async () => {
    const files = await presetFiles();
    queueFiles(files);
    addLog("Loaded 4 geometry samples · slab · vintage · chrome · relic");
  }, [addLog, queueFiles]);

  const done = cards.filter((c) => c.status === ProcessingStatus.Completed).length;
  const failed = cards.filter((c) => c.status === ProcessingStatus.Failed).length;
  const pending = cards.filter((c) => c.status === ProcessingStatus.Pending).length;
  const preset = OUTPUT_PRESETS[dpi];
  const progressPct = cards.length ? Math.round((done / cards.length) * 100) : 0;
  const zipMb = zipBudgetMb(Math.max(cards.length, MIN_BATCH_TARGET), dpi);

  const runBatch = async () => {
    if (busy || cards.length === 0) return;
    stopRef.current = false;
    setBusy(true);
    addLog(`WebGL batch ${cards.length} @ ${preset.label} · HF ${HF_BATCH_BACKEND.id}`);
    try {
      const completed = resume ? loadCompletedInputs() : new Set<string>();
      if (resume && completed.size) addLog(`Resume · ${completed.size} already in ${GIT_PIPELINE.log}`);
      const entries = await runWebglBatch(useBatchStore.getState().cards, {
        settings,
        dpi,
        resume,
        completedNames: completed,
        onCard: (id, next) => patch(id, next),
        onLog: addLog,
        shouldStop: () => stopRef.current,
      });
      appendJsonl(entries);
      const latest = useBatchStore.getState().cards;
      const zip = new JSZip();
      const folder = zip.folder("enhanced") ?? zip;
      for (const card of latest) {
        if (card.processedBlob) {
          folder.file(`${card.file.name.replace(/\.[^/.]+$/, "")}${GIT_PIPELINE.suffix}.jpg`, card.processedBlob);
        }
      }
      zip.file(GIT_PIPELINE.log, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
      const ctx = {
        dpi,
        settings,
        gitSource: pipeline?.git.source,
        hfSource: pipeline?.hf.source,
      };
      zip.file("manifest.json", JSON.stringify(buildManifestJson(latest, ctx), null, 2));
      zip.file("manifest.csv", buildManifestCsv(latest, ctx));
      const blob = await zip.generateAsync({ type: "blob" });
      downloadUrl(URL.createObjectURL(blob), `sports-cards_${latest.length}_${preset.dpi}dpi.zip`);
      const ok = entries.filter((e) => e.success).length;
      addLog(`Done: ${ok}/${entries.length} succeeded in this run`);
    } catch (err) {
      addLog(err instanceof Error ? err.message : "Batch failed");
    } finally {
      setBusy(false);
    }
  };

  const loadFifty = async () => {
    if (busy || loadingTests) return;
    setLoadingTests(true);
    setTestProgress(0);
    const room = Math.max(0, MAX_BATCH - useBatchStore.getState().cards.length);
    const n = Math.min(MIN_BATCH_TARGET, room);
    if (n === 0) {
      addLog(`Queue full (${MAX_BATCH}).`);
      setLoadingTests(false);
      return;
    }
    addLog(`Generating ${n} sports-card scans…`);
    let i = 0;
    const chunk: File[] = [];
    for await (const file of generateTestCardFiles(n)) {
      chunk.push(file);
      i += 1;
      setTestProgress(i);
      if (chunk.length === 8 || i === n) {
        queueFiles(chunk.splice(0, chunk.length));
      }
    }
    addLog(`Loaded ${n} test sports cards.`);
    setLoadingTests(false);
  };

  const etaHint = useMemo(() => {
    const n = Math.max(pending, 0);
    const sec = Math.round(n * 0.18);
    return `${n} pending · ~${sec}s`;
  }, [pending]);

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
        if (e.dataTransfer.files.length) queueFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="fixed inset-0 z-50 bg-bg/90 flex flex-col items-center justify-center pointer-events-none border-2 border-dashed border-fg">
          <p className="font-display text-4xl uppercase">Drop a lot</p>
          <p className="micro mt-3">Up to {MAX_BATCH} sports cards · {MIN_BATCH_TARGET}+ per run</p>
        </div>
      )}
      <AppShell
        title="Batch enhancer"
        subtitle={`${MIN_BATCH_TARGET}+ sports cards · 2.5×3.5 · WebGL · JSONL resume`}
        actions={
          <div className="flex items-center gap-2">
            <Badge>{cards.length} queued</Badge>
            <Badge tone="ok">{done} done</Badge>
            {failed > 0 && <Badge tone="danger">{failed} fail</Badge>}
          </div>
        }
      >
        <div className="flex flex-col xl:flex-row min-h-[calc(100vh-57px)]">
          <div className="flex-1 p-4 sm:p-6 space-y-4 min-w-0">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => folderRef.current?.click()} disabled={busy}>
                <FolderUp className="h-4 w-4" /> Folder
              </Button>
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => void loadSamples()} disabled={busy}>
                4 samples
              </Button>
              <Button variant="secondary" size="sm" className="min-h-11" disabled={busy || loadingTests} onClick={() => void loadFifty()}>
                {loadingTests ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {loadingTests ? `${testProgress}/${MIN_BATCH_TARGET}` : `Load ${MIN_BATCH_TARGET} tests`}
              </Button>
              <Button size="sm" className="min-h-11" onClick={() => void runBatch()} disabled={busy || cards.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {busy ? `Enhancing ${done}/${cards.length}` : `Enhance ${cards.length || MIN_BATCH_TARGET}`}
              </Button>
              {busy && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() => {
                    stopRef.current = true;
                    addLog("Stop requested — finishing current card.");
                  }}
                >
                  <Pause className="h-4 w-4" /> Stop
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                disabled={cards.length === 0 || busy}
                onClick={() => {
                  clear();
                  addLog("Queue cleared.");
                }}
              >
                <Trash2 className="h-4 w-4" /> Reset
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) queueFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={(el) => {
                  folderRef.current = el;
                  if (el) el.setAttribute("webkitdirectory", "");
                }}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) queueFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="panel p-3 flex flex-wrap gap-x-4 gap-y-1 micro text-subtle">
              <span>
                GitHub {pipeline?.git.source === "live" ? "connected" : "not connected"}
                {pipeline?.git.source === "live" ? ` · ${pipeline.git.fileCount} files` : " · configure integration"}
              </span>
              <span>
                Hugging Face {pipeline?.hf.source === "live" ? "connected" : "not connected"}
                {pipeline?.hf.source === "live" ? ` · ${pipeline.hf.className} ×${pipeline.hf.scale}` : " · configure integration"}
              </span>
              <span>
                Wolfram 2.5×3.5 in · {preset.width}×{preset.height}
              </span>
              <span>
                Linear {LINEAR_BOARD.teamKey} · webhooks · {linearCounts().open} open
              </span>
            </div>

            <div className="panel p-3">
              <div className="flex justify-between micro text-subtle mb-2">
                <span>{etaHint}</span>
                <span>
                  {done}/{cards.length || 0} · {progressPct}% · ~{zipMb} MB zip
                </span>
              </div>
              <div className="h-2 bg-elevated">
                <div className="h-full bg-accent" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {cards.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full min-h-[360px] border border-dashed border-border hover:bg-elevated/40 flex flex-col items-center justify-center gap-3 text-muted px-4"
              >
                <Upload className="h-8 w-8" />
                <p className="font-display text-3xl sm:text-4xl uppercase text-fg">Drop scans here</p>
                <p className="micro text-center leading-relaxed">
                  Phone: tap to pick photos. Desktop: drag a folder. {MIN_BATCH_TARGET}–{MAX_BATCH} · 2.5×3.5 in · JPEG ZIP
                </p>
              </button>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {cards.map((card, i) => (
                  <div
                    key={card.id}
                    className="batch-tile panel overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (busy) return;
                      setEditing(card);
                    }}
                  >
                    <div className="aspect-[5/7] relative bg-bg">
                      <img
                        src={card.processedUrl || card.thumbUrl || card.previewUrl}
                        alt={card.file.name}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute top-1 left-1 micro bg-bg/80 px-1">{String(i + 1).padStart(2, "0")}</span>
                      <div className="absolute top-1 right-1">
                        {card.status === ProcessingStatus.Completed && (
                          <Badge tone="ok">
                            <CheckCircle2 className="h-3 w-3" />
                          </Badge>
                        )}
                        {card.status === ProcessingStatus.Processing && (
                          <Badge tone="steel">
                            <Loader2 className="h-3 w-3 animate-spin" />
                          </Badge>
                        )}
                        {card.status === ProcessingStatus.Failed && <Badge tone="danger">Fail</Badge>}
                      </div>
                      {!busy && (
                        <div className="absolute bottom-1 right-1 flex gap-1">
                          {card.status === ProcessingStatus.Completed && (
                            <button
                              type="button"
                              className="bg-bg/80 p-1 text-muted hover:text-fg min-h-8 min-w-8 flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspecting(card);
                              }}
                              aria-label="Inspect"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="bg-bg/80 p-1 text-muted hover:text-fg min-h-8 min-w-8 flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(card.id);
                            }}
                            aria-label="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="px-1.5 py-1 text-[10px] tracking-wide truncate">{card.file.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="w-full xl:w-80 shrink-0 border-t xl:border-t-0 xl:border-l border-border p-4 space-y-4">
            <h3 className="micro text-subtle">Processing</h3>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Auto-crop 2.5×3.5
              <input type="checkbox" checked={settings.autoCrop} onChange={(e) => setSettings({ ...settings, autoCrop: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Descratch
              <input
                type="checkbox"
                checked={settings.enableDescratching}
                onChange={(e) => setSettings({ ...settings, enableDescratching: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Micro-dust
              <input
                type="checkbox"
                checked={settings.microDustFilter}
                onChange={(e) => setSettings({ ...settings, microDustFilter: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Anti-glare
              <input type="checkbox" checked={settings.antiGlare} onChange={(e) => setSettings({ ...settings, antiGlare: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Refractor clarity
              <input
                type="checkbox"
                checked={settings.chromeParallelClarity}
                onChange={(e) => setSettings({ ...settings, chromeParallelClarity: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Hub Real-ESRGAN ×2
              <input
                type="checkbox"
                checked={settings.hubRealEsrgan}
                onChange={(e) => setSettings({ ...settings, hubRealEsrgan: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between text-xs tracking-widest uppercase min-h-11">
              Resume JSONL
              <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} />
            </label>
            <div>
              <p className="micro text-subtle mb-2">Output · Wolfram print size</p>
              <div className="grid grid-cols-3 gap-2">
                {([300, 600, 1200] as const).map((key) => (
                  <Button key={key} variant={dpi === key ? "default" : "secondary"} size="sm" onClick={() => setDpi(key)}>
                    {key}
                  </Button>
                ))}
              </div>
              <p className="micro text-subtle mt-2 leading-relaxed">
                {CARD_INCHES.width} in × {dpi} = {preset.width} px · {CARD_INCHES.height} in × {dpi} = {preset.height} px
              </p>
              <p className="micro text-subtle mt-1 leading-relaxed">
                {preset.mp} MP · ~{preset.jpegMB} MB/card · 50 cards ≈ {preset.zip50MB} MB zip
              </p>
            </div>
            {[
              ["Restoration", "restorationStrength", 0.1, 1],
              ["Sharpen", "sharpen", 0, 2],
              ["Contrast", "contrast", 0.7, 1.5],
              ["Vibrance", "vibrance", 0, 0.6],
            ].map(([label, key, min, max]) => (
              <div key={String(key)} className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{label}</span>
                  <span>{Number(settings[key as keyof BatchSettings]).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={min as number}
                  max={max as number}
                  step={0.05}
                  value={settings[key as keyof BatchSettings] as number}
                  onChange={(e) => setSettings({ ...settings, [key]: parseFloat(e.target.value) })}
                />
              </div>
            ))}
            <div className="panel p-3 space-y-1">
              <p className="micro text-subtle">
                Hugging Face {pipeline?.hf.source === "live" ? "connected" : "configuration required"}
              </p>
              <a href={HF_BATCH_BACKEND.url} target="_blank" rel="noreferrer" className="text-xs underline tracking-wide break-all">
                {pipeline?.hf.id ?? HF_BATCH_BACKEND.id}
              </a>
              <p className="text-xs text-muted leading-relaxed">
                {pipeline?.hf.className ?? HF_BATCH_BACKEND.className} · scale ×{pipeline?.hf.scale ?? HF_BATCH_BACKEND.scale} ·{" "}
                {pipeline?.hf.numBlock ?? HF_BATCH_BACKEND.numBlock} RRDB blocks · {pipeline?.hf.weightsMb ?? HF_BATCH_BACKEND.weightsMb} MB
                weights
                {pipeline?.hf.downloads != null ? ` · ${pipeline.hf.downloads} downloads` : ""}
              </p>
              <p className="micro text-subtle leading-relaxed">
                Local WebGL crops/descratch. With Hub Real-ESRGAN ×2 on, each JPEG hits hlky/RealESRGAN_x2plus (needs HF_TOKEN).
              </p>
            </div>
            <div className="panel p-3 space-y-1">
              <p className="micro text-subtle">
                GitMCP {pipeline?.git.source === "live" ? "live" : "protocol"}
              </p>
              <a href={GIT_PIPELINE.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline tracking-wide break-all">
                {GIT_PIPELINE.owner}/{GIT_PIPELINE.repo}/gigapixel/batch.py
              </a>
              <p className="text-xs text-muted leading-relaxed">
                {GIT_PIPELINE.cli} --resume · {GIT_PIPELINE.loadFn} skips successes in {GIT_PIPELINE.log} · suffix {GIT_PIPELINE.suffix} ·
                scale {GIT_PIPELINE.scale}
              </p>
              <p className="micro text-subtle leading-relaxed">
                {(pipeline?.git.files ?? ["gigapixel/batch.py", "elan/model.py"]).join(" · ")}
                {pipeline?.git.fileCount ? ` · ${pipeline.git.fileCount} blobs` : ""}
              </p>
            </div>
            <div className="panel p-3 space-y-1">
              <p className="micro text-subtle">Linear · {LINEAR_BOARD.teamKey}</p>
              <a href={LINEAR_BOARD.projectUrl} target="_blank" rel="noreferrer" className="text-xs underline tracking-wide break-all">
                {LINEAR_BOARD.team} · {linearCounts().open} open
              </a>
              <p className="text-xs text-muted leading-relaxed">
                Job log for this 50+ queue. Linear posts via Connect OIDC to /triggers/linear (HMAC Nitro subscription deleted).
              </p>
              <Link to="/jobs" className="micro underline text-muted hover:text-fg">
                Open jobs board
              </Link>
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <p className="micro text-subtle">{GIT_PIPELINE.log}</p>
                <button
                  type="button"
                  className="micro text-muted hover:text-fg min-h-8"
                  onClick={() => {
                    clearJsonl();
                    addLog("JSONL log cleared.");
                  }}
                >
                  Clear log
                </button>
              </div>
              <div className="h-40 overflow-y-auto border border-border p-2 font-mono text-[10px] text-muted">
                {logs.length === 0 && <span>Ready for {MIN_BATCH_TARGET}+.</span>}
                {logs.map((l, i) => (
                  <div key={i} className={cn(l.includes("err") ? "text-danger" : "")}>
                    {l}
                  </div>
                ))}
                <div ref={logsEnd} />
              </div>
              {hasLog && <p className="micro text-subtle mt-2">Persisted resume log on this device</p>}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  disabled={done === 0}
                  onClick={() => {
                    const ctx = { dpi, settings, gitSource: pipeline?.git.source, hfSource: pipeline?.hf.source };
                    const blob = new Blob([JSON.stringify(buildManifestJson(cards, ctx), null, 2)], { type: "application/json" });
                    downloadUrl(URL.createObjectURL(blob), `manifest_${cards.length}.json`);
                  }}
                >
                  <FileCode className="h-4 w-4" /> JSON
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  disabled={done === 0}
                  onClick={() => {
                    const ctx = { dpi, settings, gitSource: pipeline?.git.source, hfSource: pipeline?.hf.source };
                    const blob = new Blob([buildManifestCsv(cards, ctx)], { type: "text/csv" });
                    downloadUrl(URL.createObjectURL(blob), `manifest_${cards.length}.csv`);
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4" /> CSV
                </Button>
              </div>
            </div>
          </aside>
        </div>
        {inspecting && (
          <BatchInspect
            card={cards.find((c) => c.id === inspecting.id) ?? inspecting}
            onClose={() => setInspecting(null)}
            onPatch={(next) => patch(inspecting.id, next)}
          />
        )}
        {editing && (
          <BatchItemEditor
            card={editing}
            globalSettings={settings}
            onClose={() => setEditing(null)}
            onSave={(next) => {
              patch(editing.id, next);
              addLog(`override ${editing.file.name}`);
            }}
          />
        )}
      </AppShell>
    </div>
  );
}
