import { useRef } from "react";
import { Image as ImageIcon, Plus, Upload } from "lucide-react";
import type { CardItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PresetsBar({
  cards,
  activeCardId,
  onSelectCard,
  onFileUpload,
}: {
  cards: CardItem[];
  activeCardId: string;
  onSelectCard: (id: string) => void;
  onFileUpload: (files: FileList | File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted font-mono flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-steel" />
          Queue · {cards.length}
        </h3>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          <Plus className="h-4 w-4" />
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onFileUpload(e.target.files)}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const active = card.id === activeCardId;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectCard(card.id)}
              className={cn(
                "text-left rounded-xl border p-2.5 transition-colors",
                active ? "border-steel/50 bg-elevated" : "border-border bg-surface hover:border-steel/30",
              )}
            >
              <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-lg bg-bg border border-border">
                <img src={card.processedBlobUrl || card.originalUrl} alt={card.name} className="h-full w-full object-cover" />
                {card.isPreset && (
                  <span className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-mono bg-bg/80 text-muted border border-border">
                    Preset
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs font-medium truncate">{card.name}</p>
              <p className="text-[10px] font-mono text-subtle">
                {card.width}×{card.height}
              </p>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-dashed border-border hover:border-steel/40 bg-surface/40 p-2.5 flex flex-col items-center justify-center gap-2 min-h-[160px] text-muted hover:text-fg"
        >
          <Upload className="h-5 w-5" />
          <span className="text-xs">Drop a scan</span>
        </button>
      </div>
    </div>
  );
}
