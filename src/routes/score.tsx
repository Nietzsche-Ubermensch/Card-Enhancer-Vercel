import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  EMPTY_METADATA,
  FIELD_WEIGHTS,
  qualityScoreFromMetadata,
  type CardMetadata,
} from "@/lib/rewards";

export const Route = createFileRoute("/score")({ component: ScorePage });

const EXAMPLES: { label: string; data: CardMetadata }[] = [
  {
    label: "Alex Windsor",
    data: {
      subjectName: "Alex Windsor",
      cardNumber: "3",
      manufacturer: "Upper Deck",
      year: "2026",
      stats: "5'5\" · Norwich, England",
    },
  },
  {
    label: "Partial scan",
    data: {
      subjectName: "Unknown rookie",
      cardNumber: "",
      manufacturer: "Topps",
      year: "1993",
      stats: "",
    },
  },
  {
    label: "Empty",
    data: EMPTY_METADATA,
  },
];

function ScorePage() {
  const [meta, setMeta] = useState<CardMetadata>(EXAMPLES[0].data);
  const result = useMemo(() => qualityScoreFromMetadata(meta), [meta]);
  const pct = ((result.reward - 1) / 1.5) * 100;

  const set = (key: keyof CardMetadata, value: string) =>
    setMeta((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title="Scoring" subtitle="Truth reward · metadata → 1.0–2.5">
      <main className="max-w-5xl mx-auto p-4 sm:p-8 grid lg:grid-cols-2 gap-8">
        <div className="space-y-5">
          <p className="text-xs tracking-widest uppercase text-muted leading-relaxed">
            Ported from <code>card_enhancer.rewards</code>. Filled fields add weight; the sum is scaled to t*
            and passed through tanh / sigmoid.
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="micro border border-border px-3 py-2 hover:bg-elevated"
                onClick={() => setMeta(ex.data)}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="panel p-5 space-y-4">
            {FIELD_WEIGHTS.map((field) => (
              <label key={field.key} className="block">
                <span className="micro text-subtle flex justify-between">
                  <span>{field.label}</span>
                  <span>{field.weight.toFixed(2)}</span>
                </span>
                <input
                  className="field mt-2 min-h-11"
                  value={meta[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.label}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-paper p-8 text-center">
            <p className="micro opacity-60">Quality reward</p>
            <p className="font-display text-7xl mt-3 tabular-nums">{result.reward.toFixed(3)}</p>
            <p className="micro mt-4 opacity-70">
              raw {result.raw.toFixed(2)} · t* {result.tStar.toFixed(2)}
            </p>
            <div className="mt-6 h-2 w-full bg-ink/15">
              <div className="h-full bg-ink" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
            </div>
            <p className="micro mt-3 opacity-60">Range 1.0 — 2.5</p>
          </div>

          <div className="panel p-5 space-y-3">
            <p className="micro text-subtle">Contributing fields</p>
            {FIELD_WEIGHTS.map((field) => {
              const on = Boolean(meta[field.key].trim());
              return (
                <div key={field.key} className="flex items-center justify-between text-xs tracking-widest uppercase">
                  <span className={on ? "text-fg" : "text-subtle"}>{field.label}</span>
                  <span className={on ? "text-fg" : "text-subtle"}>{on ? `+${field.weight}` : "0"}</span>
                </div>
              );
            })}
          </div>

          <div className="panel p-5">
            <p className="micro text-subtle mb-3">Function</p>
            <pre className="text-[11px] leading-relaxed overflow-x-auto">
{`if t* < 0:  tanh(t*) + 2.0     # (1.0, 2.0)
else:      1.5 + sigmoid(t*)  # [2.0, 2.5)`}
            </pre>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
