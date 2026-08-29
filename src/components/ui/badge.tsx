import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "ok" | "warn" | "danger" | "steel";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-elevated text-muted border-border",
    ok: "bg-ok/20 text-ok border-ok/40",
    warn: "bg-warn/20 text-warn border-warn/40",
    danger: "bg-danger/20 text-danger border-danger/40",
    steel: "bg-fg/10 text-fg border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
