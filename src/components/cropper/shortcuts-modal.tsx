import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ITEMS = [
  { keys: ["Space"], desc: "Auto-detect card edges", cat: "Actions" },
  { keys: ["Enter"], desc: "Export high-res PNG", cat: "Actions" },
  { keys: ["Esc"], desc: "Reset enhancement filters", cat: "Actions" },
  { keys: ["Arrows"], desc: "Nudge crop quad", cat: "Crop" },
  { keys: ["Shift", "Arrows"], desc: "Nudge faster", cat: "Crop" },
  { keys: ["["], desc: "Rotate 90° CCW", cat: "Rotate" },
  { keys: ["]"], desc: "Rotate 90° CW", cat: "Rotate" },
  { keys: ["Alt", "← / →"], desc: "Fine deskew ±0.5°", cat: "Rotate" },
  { keys: ["Shift", "R"], desc: "Reset rotation", cat: "Rotate" },
  { keys: ["G"], desc: "Toggle alignment grid", cat: "Rotate" },
  { keys: ["?"], desc: "Open this guide", cat: "System" },
  { keys: ["Ctrl", "Shift", "A"], desc: "GPU telemetry audit", cat: "System" },
];

export function ShortcutsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("All");
  const cats = ["All", "Crop", "Actions", "Rotate", "System"];
  const filtered = ITEMS.filter((item) => {
    const okTab = tab === "All" || item.cat === tab;
    const q = query.toLowerCase();
    return okTab && (item.desc.toLowerCase().includes(q) || item.keys.join(" ").toLowerCase().includes(q));
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTab("All");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-steel" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Precision crop, deskew, and export without leaving the bench.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-3 border-b border-border flex flex-col sm:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 flex-1 rounded-md bg-elevated border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-steel/40"
          />
          <div className="flex gap-1 overflow-x-auto">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTab(c)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs border",
                  tab === c ? "bg-elevated text-fg border-border" : "text-muted border-transparent hover:text-fg",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5 overflow-y-auto grid sm:grid-cols-2 gap-2">
          {filtered.map((item) => (
            <div key={item.desc} className="rounded-lg border border-border bg-elevated/40 p-3">
              <p className="text-sm font-medium">{item.desc}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.keys.map((k) => (
                  <span key={k} className="kbd">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
