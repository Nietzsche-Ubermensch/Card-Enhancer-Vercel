import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { generateCardArt, getAiStatus } from "@/lib/ai";
import { downloadUrl, cn } from "@/lib/utils";
import type { ImageSize } from "@/lib/types";

export const Route = createFileRoute("/generate")({ component: GeneratePage });

const PROMPTS = [
  "1952 Topps-style baseball portrait, cream paper, red serif nameplate, stadium dusk",
  "Modern chrome basketball rookie, silver foil border, city skyline, dramatic rim light",
  "Holographic dragon TCG legendary, steel frame, moonlit mountain, print-ready",
  "NFL relic card, jersey patch window, navy leather texture, championship lighting",
];

const STACK = [
  { id: "xAI", model: "grok-imagine-image-2.0", env: "XAI_API_KEY" },
  { id: "OpenAI", model: "gpt-image-1", env: "OPENAI_API_KEY" },
  { id: "Gemini", model: "imagen-4.0-generate-001", env: "GEMINI_API_KEY" },
  { id: "OpenRouter", model: "flux.1-schnell", env: "OPENROUTER_API_KEY" },
  { id: "Venice", model: "venice-sd35", env: "VENICE_API_KEY" },
  { id: "HuggingFace", model: "FLUX.1-schnell", env: "HF_TOKEN" },
] as const;

function GeneratePage() {
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [size, setSize] = useState<ImageSize>("1K");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<{ id: string; model: string } | null>(null);
  const [creds, setCreds] = useState<Record<string, boolean>>({});
  const [aiOk, setAiOk] = useState(true);

  useEffect(() => {
    void getAiStatus()
      .then((s) => {
        setAiOk(s.available);
        setCreds(s.credentials ?? {});
      })
      .catch(() => setAiOk(false));
  }, []);

  const liveCount = STACK.filter((row) => {
    if (row.env === "XAI_API_KEY") return Boolean(creds.XAI_API_KEY || creds.AI_GATEWAY_API_KEY);
    return Boolean(creds[row.env]);
  }).length;

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setUsed(null);
    try {
      const result = await generateCardArt({ data: { prompt: prompt.trim(), size } });
      if (result.ok) {
        setImage(result.image);
        setUsed("used" in result ? result.used : { id: "xAI", model: "grok-imagine-image-2.0" });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Art studio" subtitle="Image models only · chat models never render art">
      <div className="max-w-6xl mx-auto p-4 sm:p-8 grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Describe a card face. First live image key wins: Imagine 2.0, then gpt-image-1, Imagen 4,
            Flux, Venice. Chat models (grok-4.6, gpt-4o) are not in this stack.
          </p>
          {!aiOk && liveCount === 0 && (
            <p className="text-sm text-warn panel p-3">
              No image-model keys on this host. Set <span className="font-mono">XAI_API_KEY</span> or
              another image key on the Node process — never <span className="font-mono">VITE_*</span>.
            </p>
          )}
          <div className="panel p-5 space-y-4">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-subtle">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-none bg-elevated border border-border p-3 text-sm outline-none focus:ring-2 focus:ring-steel/40 resize-none"
              placeholder="Subject, era, finish, lighting…"
            />
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="text-[11px] px-2 py-1 border border-border text-muted hover:text-fg hover:bg-elevated min-h-11"
                >
                  {p.split(",")[0]}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-subtle mb-2">Resolution</p>
              <div className="grid grid-cols-2 gap-2">
                {(["1K", "2K"] as const).map((s) => (
                  <Button key={s} className="min-h-11" variant={size === s ? "default" : "secondary"} onClick={() => setSize(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full min-h-11" disabled={loading || !prompt.trim()} onClick={generate}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Rendering…" : "Generate artwork"}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
            {used && (
              <p className="micro text-ok">
                Rendered by {used.id} · {used.model}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-6 min-h-[420px] flex flex-col items-center justify-center relative overflow-hidden">
            {image ? (
              <div className="w-full max-w-sm">
                <div className="aspect-[5/7] overflow-hidden border border-border bg-bg relative">
                  <img src={image} alt="Generated card art" className="h-full w-full object-cover" />
                  <div className="scanline" />
                </div>
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" className="min-h-11" onClick={() => downloadUrl(image, `cardcrop-art-${Date.now()}.png`)}>
                    <Download className="h-4 w-4" />
                    Export card
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full border border-dashed border-border flex items-center justify-center">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin text-steel" /> : <ImageIcon className="h-6 w-6" />}
                </div>
                <p className="font-mono text-xs tracking-widest">{loading ? "RENDERING" : "AWAITING PROMPT"}</p>
              </div>
            )}
          </div>
          <div className="panel p-4 space-y-2">
            <p className="micro text-subtle">Image stack · {liveCount}/{STACK.length} keys present</p>
            {STACK.map((row) => {
              const on =
                row.env === "XAI_API_KEY"
                  ? Boolean(creds.XAI_API_KEY || creds.AI_GATEWAY_API_KEY)
                  : Boolean(creds[row.env]);
              const active = used?.id === row.id;
              return (
                <div key={row.id} className={cn("flex items-center justify-between gap-3 py-1", active && "text-ok")}>
                  <span className="text-xs font-bold uppercase tracking-widest">{row.id}</span>
                  <span className="text-[10px] font-mono text-subtle truncate">{row.model}</span>
                  <span className={cn("micro", on ? "text-ok" : "text-subtle")}>{on ? "key" : "off"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
