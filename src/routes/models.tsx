import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURED_MODELS, getUpscalerFamilies, searchHfModels, type FamilyLive, type HfModel } from "@/lib/hub";
import { UPSCALER_FAMILIES } from "@/lib/upscalers";
import { compactNumber, formatDate } from "@/lib/format";

export const Route = createFileRoute("/models")({ component: ModelsPage });

const PRESETS = ["Real-ESRGAN", "ESRGAN", "SwinIR", "super resolution"];

function ModelsPage() {
  const [query, setQuery] = useState("Real-ESRGAN");
  const [models, setModels] = useState<HfModel[]>(FEATURED_MODELS);
  const [source, setSource] = useState<"featured" | "live" | "fallback">("featured");
  const [families, setFamilies] = useState<FamilyLive[]>(UPSCALER_FAMILIES.map((f) => ({ ...f, live: false })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (q: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await searchHfModels({ data: { query: q, limit: 16 } });
      setModels(result.models);
      setSource(result.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setModels(FEATURED_MODELS);
      setSource("fallback");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void runSearch("Real-ESRGAN");
    void getUpscalerFamilies().then(setFamilies).catch(() => setFamilies([]));
  }, []);

  return (
    <AppShell title="Models" subtitle="ESRGAN · Real-ESRGAN · SwinIR · LFESR">
      <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-10">
        <div>
          <p className="micro text-subtle">Four families · Hub + GitHub</p>
          <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide">Upscaler rack</h2>
          <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
            Batch queue stays on Real-ESRGAN ×2 (RRDBNet, 66.9 MB). SwinIR is the quality pick. LFESR is 2025 paper-only
            until Hub weights land.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-px bg-border border border-border">
          {families.map((family) => (
            <article key={family.id} className="bg-bg p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl uppercase">{family.name}</h3>
                <Badge>{family.year}</Badge>
                {family.batchRecipe && <Badge tone="ok">batch recipe</Badge>}
                <Badge tone={family.live ? "ok" : family.hub ? "steel" : undefined}>
                  {family.live ? "Hub live" : family.hub ? "Hub" : "paper"}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed">{family.strengths}</p>
              <p className="text-xs text-muted leading-relaxed">{family.weakness}</p>
              <dl className="grid grid-cols-3 gap-3 micro">
                <div>
                  <dt className="text-subtle">Quality</dt>
                  <dd className="mt-1 text-fg">{family.quality != null ? `${family.quality}/10` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-subtle">RTX 4090</dt>
                  <dd className="mt-1 text-fg">{family.seconds != null ? `${family.seconds}s` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Hub</dt>
                  <dd className="mt-1 text-fg">{family.downloads != null ? compactNumber(family.downloads) : "none"}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted">Best for {family.bestFor} · artifacts {family.artifacts}</p>
              <div className="flex flex-wrap gap-2">
                {family.hubUrl && (
                  <a
                    href={family.hubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="micro border border-border px-3 py-2 hover:bg-elevated"
                  >
                    Hugging Face
                  </a>
                )}
                {family.githubUrl && (
                  <a
                    href={family.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="micro border border-border px-3 py-2 hover:bg-elevated"
                  >
                    GitHub
                  </a>
                )}
                <a
                  href={family.paperUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="micro border border-border px-3 py-2 hover:bg-elevated"
                >
                  Paper
                </a>
                <button
                  type="button"
                  className="micro border border-border px-3 py-2 hover:bg-elevated"
                  onClick={() => {
                    setQuery(family.search);
                    void runSearch(family.search);
                  }}
                >
                  Search Hub
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
          <div>
            <p className="micro text-subtle mb-3">Search the Hub</p>
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(query);
              }}
            >
              <label className="sr-only" htmlFor="hf-q">
                Model search
              </label>
              <input
                id="hf-q"
                className="field min-h-11"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Real-ESRGAN, SwinIR, ESRGAN…"
              />
              <Button type="submit" className="min-h-11 px-6" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </form>
            <div className="flex flex-wrap gap-2 mt-3">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="micro border border-border px-3 py-2 hover:bg-elevated"
                  onClick={() => {
                    setQuery(p);
                    void runSearch(p);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="panel p-5 space-y-2">
            <p className="micro text-subtle">Source</p>
            <p className="font-display text-2xl uppercase">
              {source === "live" ? "Live Hub" : source === "fallback" ? "Cached catalog" : "Featured"}
            </p>
            <p className="text-xs text-muted leading-relaxed tracking-wide uppercase">
              Live Hub downloads overlay the four-family rack. Queue still uses hlky/RealESRGAN_x2plus.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid sm:grid-cols-2 gap-4">
          {models.map((m) => (
            <article key={m.id} className="panel p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl uppercase leading-tight break-all">{m.id}</h2>
                {m.pipeline_tag && <Badge tone="steel">{m.pipeline_tag}</Badge>}
              </div>
              <dl className="grid grid-cols-3 gap-3 micro">
                <div>
                  <dt className="text-subtle">Downloads</dt>
                  <dd className="mt-1 text-fg">{compactNumber(m.downloads)}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Likes</dt>
                  <dd className="mt-1 text-fg">{compactNumber(m.likes)}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Updated</dt>
                  <dd className="mt-1 text-fg">{formatDate(m.lastModified)}</dd>
                </div>
              </dl>
              {m.tags && m.tags.length > 0 && (
                <p className="text-[10px] tracking-widest uppercase text-subtle">{m.tags.slice(0, 5).join(" · ")}</p>
              )}
              <a
                href={`https://huggingface.co/${m.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest border border-border px-3 py-2 hover:bg-elevated w-fit"
              >
                Open on Hugging Face
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </article>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
