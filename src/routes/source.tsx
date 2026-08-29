import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Folder, FileText, Loader2, Search, Star } from "lucide-react";
import Markdown from "react-markdown";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FEATURED_REPOS,
  getGithubReadme,
  getGithubTree,
  searchGithubRepos,
  type GhRepo,
  type GhTreeEntry,
} from "@/lib/hub";
import { loadGithubReadmePublic, loadGithubTreePublic } from "@/lib/hub-client";
import { compactNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/source")({ component: SourcePage });

function SourcePage() {
  const [query, setQuery] = useState("ELAN super-resolution");
  const [repos, setRepos] = useState<GhRepo[]>(FEATURED_REPOS);
  const [source, setSource] = useState<"featured" | "live" | "fallback">("featured");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(FEATURED_REPOS[0]);
  const [readme, setReadme] = useState<string>("");
  const [tree, setTree] = useState<GhTreeEntry[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);

  const runSearch = async (q: string) => {
    setBusy(true);
    try {
      const result = await searchGithubRepos({ data: { query: q } });
      setRepos(result.repos);
      setSource(result.source);
      if (result.repos[0]) setSelected(result.repos[0]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void runSearch("user:Nietzsche-Ubermensch card enhancer");
  }, []);

  useEffect(() => {
    const [owner, repo] = selected.full_name.split("/");
    if (!owner || !repo) return;
    let cancelled = false;
    setDetailBusy(true);
    Promise.all([
      getGithubReadme({ data: { owner, repo } }).catch(async () => loadGithubReadmePublic(owner, repo)),
      getGithubTree({ data: { owner, repo } }).catch(async () => loadGithubTreePublic(owner, repo)),
    ])
      .then(async ([md, tr]) => {
        if (cancelled) return;
        const readme = md.ok ? md : await loadGithubReadmePublic(owner, repo);
        const tree =
          tr.ok && "tree" in tr && tr.tree.length > 0 ? tr : await loadGithubTreePublic(owner, repo);
        if (cancelled) return;
        setReadme(readme.ok ? readme.text : `_${"error" in readme ? readme.error : "README unavailable"}_`);
        setTree(tree.ok ? (tree.tree as GhTreeEntry[]) : []);
      })
      .finally(() => {
        if (!cancelled) setDetailBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected.full_name]);

  return (
    <AppShell title="Source" subtitle="GitHub · card-enhancer-suite · ELAN · Real-ESRGAN">
      <main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="flex flex-col lg:flex-row gap-3">
          <form
            className="flex-1 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <label className="sr-only" htmlFor="gh-q">
              Repository search
            </label>
            <input
              id="gh-q"
              className="field min-h-11"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GitHub repositories…"
            />
            <Button type="submit" className="min-h-11 px-6" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </form>
          <p className="micro text-subtle self-center">
            {source === "live" ? "Live GitHub API" : "Catalog"}
          </p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 items-start">
          <div className="space-y-3">
            {repos.map((r) => {
              const active = r.full_name === selected.full_name;
              return (
                <button
                  key={r.full_name}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={cn(
                    "w-full text-left panel p-4 transition-colors",
                    active ? "bg-elevated border-fg/50" : "hover:bg-elevated/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-lg uppercase leading-tight">{r.full_name}</h2>
                    <span className="micro flex items-center gap-1 shrink-0">
                      <Star className="h-3 w-3" />
                      {compactNumber(r.stargazers_count)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted leading-relaxed">{r.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.language && <Badge>{r.language}</Badge>}
                    <Badge tone="muted">{formatDate(r.updated_at)}</Badge>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="panel-paper p-5">
              <p className="micro opacity-60">Selected</p>
              <h2 className="font-display text-3xl uppercase mt-1">{selected.name}</h2>
              <p className="mt-3 text-xs tracking-widest uppercase leading-relaxed opacity-80">
                {selected.description}
              </p>
              <a
                href={selected.html_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
              >
                Open on GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="panel p-4">
              <p className="micro text-subtle mb-3">Tree</p>
              {detailBusy && tree.length === 0 ? (
                <p className="micro text-muted">Loading…</p>
              ) : (
                <ul className="max-h-64 overflow-auto space-y-1">
                  {tree.slice(0, 40).map((e) => (
                    <li key={e.path} className="flex items-center gap-2 text-[11px] tracking-wide">
                      {e.type === "tree" ? (
                        <Folder className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{e.path}</span>
                    </li>
                  ))}
                  {tree.length === 0 && (
                    <li className="micro text-muted">
                      Tree empty — serverFn offline and jsDelivr had no files.
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="panel p-5 max-h-[480px] overflow-auto">
              <p className="micro text-subtle mb-3">README</p>
              <div className="text-xs leading-relaxed space-y-3 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:uppercase [&_h2]:font-display [&_h2]:text-lg [&_h2]:uppercase [&_h2]:mt-4 [&_code]:bg-elevated [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:bg-elevated [&_pre]:p-3 [&_a]:underline">
                <Markdown>{readme || "_Loading README…_"}</Markdown>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
