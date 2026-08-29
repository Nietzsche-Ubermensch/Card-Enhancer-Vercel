import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { generateCardArt, getAiStatus } from "@/lib/ai";
import { downloadUrl } from "@/lib/utils";
import type { ImageSize } from "@/lib/types";

export const Route = createFileRoute("/generate")({ component: GeneratePage });

const PROMPTS = [
  "1952 Topps-style baseball portrait, cream paper, red serif nameplate, stadium dusk",
  "Modern chrome basketball rookie, silver foil border, city skyline, dramatic rim light",
  "Holographic dragon TCG legendary, steel frame, moonlit mountain, print-ready",
  "NFL relic card, jersey patch window, navy leather texture, championship lighting",
];

function GeneratePage() {
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [size, setSize] = useState<ImageSize>("1K");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOk, setAiOk] = useState(true);

  useEffect(() => {
    void getAiStatus()
      .then((s) => setAiOk(s.available))
      .catch(() => setAiOk(false));
  }, []);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateCardArt({ data: { prompt: prompt.trim(), size } });
      if (result.ok) setImage(result.image);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Art studio" subtitle="Grok Imagine card art">
      <div className="max-w-5xl mx-auto p-4 sm:p-8 grid lg:grid-cols-2 gap-8">
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Describe a card face. Generation uses Grok Imagine and is billed per image — one request at a time.
          </p>
          {!aiOk && (
            <p className="text-sm text-warn panel p-3">
              Imagine runs on the server with <span className="font-mono">XAI_API_KEY</span>. This
              public page has no Node process, so generation is offline. Batch enhance (WebGL) still
              runs in the browser.
            </p>
          )}
          <div className="panel p-5 space-y-4">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-subtle">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-lg bg-elevated border border-border p-3 text-sm outline-none focus:ring-2 focus:ring-steel/40 resize-none"
              placeholder="Subject, era, finish, lighting…"
            />
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="text-[11px] px-2 py-1 rounded-md border border-border text-muted hover:text-fg hover:bg-elevated"
                >
                  {p.split(",")[0]}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-subtle mb-2">Resolution</p>
              <div className="grid grid-cols-2 gap-2">
                {(["1K", "2K"] as const).map((s) => (
                  <Button key={s} variant={size === s ? "default" : "secondary"} onClick={() => setSize(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full h-11" disabled={loading || !prompt.trim() || !aiOk} onClick={generate}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Rendering…" : "Generate artwork"}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </div>
        <div className="panel p-6 min-h-[420px] flex flex-col items-center justify-center">
          {image ? (
            <div className="w-full max-w-sm">
              <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-bg">
                <img src={image} alt="Generated card art" className="h-full w-full object-cover" />
              </div>
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => downloadUrl(image, `cardcrop-art-${Date.now()}.png`)}>
                  <Download className="h-4 w-4" />
                  Download
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
      </div>
    </AppShell>
  );
}
