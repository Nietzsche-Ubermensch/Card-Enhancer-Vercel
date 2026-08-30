import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Crop, Layers, Wand2, MessageSquare, Menu, Keyboard, Box, Github, Scale, Home, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Batch", desc: "50+ sports cards · ZIP", icon: Layers },
  { to: "/jobs", label: "Jobs", desc: "Linear webhooks · JUG", icon: ListTodo },
  { to: "/studio", label: "Inspect", desc: "Crop + straighten one card", icon: Crop },
  { to: "/models", label: "Models", desc: "Hugging Face upscalers", icon: Box },
  { to: "/source", label: "Source", desc: "GitHub pipeline", icon: Github },
  { to: "/score", label: "Scoring", desc: "Truth reward", icon: Scale },
  { to: "/generate", label: "Art studio", desc: "Imagine · image models", icon: Wand2 },
  { to: "/assistant", label: "Lumina", desc: "Grading assistant", icon: MessageSquare },
  { to: "/suite", label: "Suite", desc: "Landing", icon: Home },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  onOpenShortcuts,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onOpenShortcuts?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      <p className="micro px-3 mb-3 text-subtle">Workspaces</p>
      {NAV.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border",
              active
                ? "bg-elevated text-fg border-border"
                : "text-muted hover:text-fg hover:bg-elevated/60 border-transparent",
            )}
          >
            <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-fg" : "text-subtle")} />
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-widest leading-tight">{item.label}</span>
              <span className="block text-[10px] text-subtle truncate mt-0.5 tracking-wider">{item.desc}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link to="/" className="flex items-center gap-3 px-4 py-4 border-b border-border">
      <img src="/brand/mark.jpg" alt="" className="h-9 w-9 object-cover" />
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-wide leading-tight">Card Enhancer</p>
        <p className="micro text-subtle mt-1">Suite · v1.0</p>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-bg text-fg flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-bg sticky top-0 h-screen">
        {brand}
        {nav}
        <div className="p-3 border-t border-border">
          {onOpenShortcuts && (
            <Button variant="ghost" size="sm" className="w-full justify-between" onClick={onOpenShortcuts}>
              <span className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                Shortcuts
              </span>
              <span className="kbd">?</span>
            </Button>
          )}
          <p className="mt-2 px-2 micro text-subtle">Local WebGL + Hub</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="lg:hidden min-h-11 min-w-11" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-display text-base font-medium uppercase tracking-wide truncate">{title}</h1>
              {subtitle && <p className="micro text-muted mt-1 line-clamp-1">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        </header>
        <div className="flex-1">{children}</div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="bg-bg">
          {brand}
          {nav}
        </SheetContent>
      </Sheet>
    </div>
  );
}
