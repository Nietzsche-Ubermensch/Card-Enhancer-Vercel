import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LINEAR_BOARD, linearCounts } from "@/lib/linear-board";
import { MCP_MAP } from "@/lib/mcp-map";
import { loadLinearJobs } from "@/lib/linear-jobs";
import { runConnectorProbe, type ConnectorRow } from "@/lib/connectors";
import { loadPipelineSnapshot } from "@/lib/hub";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jobs")({
  loader: async () => {
    const [jobs, connectors, snap] = await Promise.all([
      loadLinearJobs(),
      runConnectorProbe(),
      loadPipelineSnapshot(),
    ]);
    return {
      jobs,
      connectors,
      pipeline: `${snap.git.source} git · ${snap.hf.source} ${snap.hf.className} ×${snap.hf.scale}`,
    };
  },
  component: JobsPage,
});

type ReplaySample = "issue.update" | "issue.create" | "comment.create";

type LinearDelivery = {
  id: string;
  receivedAt: string;
  source: "linear" | "replay";
  signature: "verified" | "unsigned" | "invalid";
  event: string;
  action: string;
  type: string;
  identifier: string;
  title: string;
  state: string;
  actor: string;
  url?: string;
  changed: string[];
};

type WebhookContract = {
  path: string;
  secretPresent: boolean;
  resourceTypes: string[];
  freshness: string;
};

const ORDER: Record<string, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  completed: 3,
  canceled: 4,
};

function tone(type: string) {
  if (type === "completed") return "ok" as const;
  if (type === "started") return "steel" as const;
  if (type === "canceled") return "danger" as const;
  return undefined;
}

function connectorTone(state: ConnectorRow["state"]) {
  if (state === "entitled" || state === "live") return "ok" as const;
  if (state === "protocol") return "steel" as const;
  return undefined;
}

function sigTone(sig: LinearDelivery["signature"]) {
  if (sig === "verified") return "ok" as const;
  if (sig === "invalid") return "danger" as const;
  return "steel" as const;
}

type EndpointRow = { method: string; path: string; ok: boolean; detail: string };

const ENDPOINT_CHECKS: { method: "GET"; path: string; expect: number }[] = [
  { method: "GET", path: "/api/ai/status", expect: 200 },
  { method: "GET", path: "/api/pipeline", expect: 200 },
  { method: "GET", path: "/api/models?query=Real-ESRGAN&limit=4", expect: 200 },
  { method: "GET", path: "/api/source", expect: 200 },
  { method: "GET", path: "/api/connectors", expect: 200 },
  { method: "GET", path: "/api/jobs", expect: 200 },
  { method: "GET", path: "/api/webhooks/linear", expect: 200 },
];

function JobsPage() {
  const data = Route.useLoaderData();
  const { jobs, connectors, pipeline } = data;
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [events, setEvents] = useState<LinearDelivery[]>([]);
  const [contract, setContract] = useState<WebhookContract | undefined>();
  const [replaying, setReplaying] = useState<ReplaySample | null>(null);

  useEffect(() => {
    void refreshInbox();
    void Promise.all(
      ENDPOINT_CHECKS.map(async (check) => {
        try {
          const res = await fetch(check.path);
          const match = res.status === check.expect;
          return {
            method: check.method,
            path: check.path.split("?")[0],
            ok: match,
            detail: `${res.status}${match ? "" : ` ≠ ${check.expect}`}`,
          };
        } catch {
          return { method: check.method, path: check.path.split("?")[0], ok: false, detail: "failed" };
        }
      }),
    ).then(setEndpoints);
  }, []);

  async function refreshInbox() {
    const res = await fetch("/api/webhooks/linear");
    const json = (await res.json()) as { events?: LinearDelivery[]; contract?: WebhookContract };
    setEvents(json.events ?? []);
    setContract(json.contract);
  }

  async function replay(sample: ReplaySample) {
    setReplaying(sample);
    try {
      await fetch("/api/webhooks/linear/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample }),
      });
      await refreshInbox();
    } finally {
      setReplaying(null);
    }
  }

  const issues = [...jobs.issues].sort((a, b) => (ORDER[a.statusType] ?? 9) - (ORDER[b.statusType] ?? 9));
  const counts = jobs.counts ?? linearCounts(jobs.issues);
  const endpointOk = endpoints.filter((e) => e.ok).length;

  return (
    <AppShell title="Jobs" subtitle={`${LINEAR_BOARD.teamKey} · GitHub MCP ↔ Linear`}>
      <main className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="micro text-subtle">Linear project · {jobs.source}</p>
            <a
              href={LINEAR_BOARD.projectUrl}
              target="_blank"
              rel="noreferrer"
              className="font-display text-2xl sm:text-3xl uppercase tracking-wide hover:underline"
            >
              {LINEAR_BOARD.project}
            </a>
            <p className="text-xs text-muted mt-2">{pipeline}</p>
          </div>
          <div className="flex gap-2">
            <Badge>{counts.open} open</Badge>
            <Badge tone="steel">{counts.started} active</Badge>
            <Badge tone="ok">{counts.done} done</Badge>
          </div>
        </div>

        <section className="space-y-3">
          <p className="micro text-subtle">xAI · Hugging Face · GitHub · Linear · WebGL</p>
          <h2 className="font-display text-xl uppercase tracking-wide">MCP map</h2>
          <ul className="panel divide-y divide-border">
            {MCP_MAP.map((row) => {
              const xaiLive = connectors.rows.some(
                (r) => r.id === "xAI" && (r.state === "entitled" || r.state === "live"),
              );
              const live = row.id === "xai" ? xaiLive : row.live;
              return (
              <li key={row.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm">{row.ours}</p>
                  <p className="text-xs text-muted mt-1">{row.note}</p>
                </div>
                <Badge tone={live ? "ok" : "steel"}>{live ? "live" : "needs Nitro key"}</Badge>
              </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="micro text-subtle">GitHub MCP ↔ Linear · optional inbound POST</p>
              <h2 className="font-display text-xl uppercase tracking-wide">Webhook inbox</h2>
            </div>
            <Badge tone={contract?.secretPresent ? "ok" : "steel"}>
              {contract?.secretPresent ? "secret present" : "unsigned mode"}
            </Badge>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            You do not need HMAC. GitHub MCP is already connected to Linear. HMAC-SHA256 is only Linear's
            anti-spoof if Linear POSTs at this app. Replay still runs the same parser.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={replaying !== null} onClick={() => void replay("issue.update")}>
              {replaying === "issue.update" ? "Replaying…" : "Replay Issue update"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={replaying !== null}
              onClick={() => void replay("comment.create")}
            >
              {replaying === "comment.create" ? "Replaying…" : "Replay Comment"}
            </Button>
            <a
              href={LINEAR_BOARD.webhookDocs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center min-h-8 px-3 text-[10px] font-bold uppercase tracking-widest border border-border hover:bg-elevated"
            >
              Linear docs
            </a>
          </div>
          <ul className="grid sm:grid-cols-2 gap-px bg-border border border-border">
            <li className="bg-bg px-4 py-3 space-y-1">
              <p className="micro text-subtle">POST</p>
              <p className="font-mono text-xs">{LINEAR_BOARD.webhookPath}</p>
            </li>
            <li className="bg-bg px-4 py-3 space-y-1">
              <p className="micro text-subtle">Freshness</p>
              <p className="font-mono text-xs">{contract?.freshness ?? "webhookTimestamp within 60s"}</p>
            </li>
            <li className="bg-bg px-4 py-3 space-y-1 sm:col-span-2">
              <p className="micro text-subtle">Resource types</p>
              <p className="text-xs text-muted leading-relaxed">
                {(contract?.resourceTypes ?? ["Issue", "Comment", "Project"]).join(" · ")}
              </p>
            </li>
          </ul>
          <ul className="divide-y divide-border border border-border">
            {events.map((event) => (
              <li key={event.id} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="micro text-subtle">{event.identifier}</span>
                  <Badge>{event.action}</Badge>
                  <Badge tone="steel">{event.type}</Badge>
                  <Badge tone={sigTone(event.signature)}>{event.signature}</Badge>
                  <span className="micro text-subtle ml-auto">{event.source}</span>
                </div>
                <p className="text-sm">{event.title}</p>
                <p className="text-xs text-muted">
                  {event.actor}
                  {event.state ? ` · ${event.state}` : ""}
                  {event.changed.length ? ` · changed ${event.changed.join(", ")}` : ""}
                </p>
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted">
                No deliveries yet. Replay an Issue update to run the same HMAC parser Linear uses, or point a workspace
                webhook at this path.
              </li>
            )}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="micro text-subtle">HTTP contract</p>
              <h2 className="font-display text-xl uppercase tracking-wide">Endpoints</h2>
            </div>
            {endpoints.length > 0 && (
              <Badge tone={endpointOk === endpoints.length ? "ok" : "danger"}>
                {endpointOk}/{endpoints.length} pass
              </Badge>
            )}
          </div>
          <ul className="divide-y divide-border border border-border">
            {endpoints.map((row) => (
              <li key={`${row.method}:${row.path}`} className="flex items-center gap-3 px-4 py-2.5 min-h-11">
                <span className="micro w-10 shrink-0 text-subtle">{row.method}</span>
                <span className="flex-1 font-mono text-xs">{row.path}</span>
                <Badge tone={row.ok ? "ok" : "danger"}>{row.detail}</Badge>
              </li>
            ))}
            {endpoints.length === 0 && (
              <li className="px-4 py-3 text-xs text-muted">Checking GitMCP, Hugging Face, Linear, and xAI routes…</li>
            )}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="micro text-subtle">Nine providers</p>
              <h2 className="font-display text-xl uppercase tracking-wide">Connector probe</h2>
            </div>
            <Badge tone="ok">
              {connectors.live}/{connectors.total} live
            </Badge>
          </div>
          <ul className="grid sm:grid-cols-2 gap-px bg-border border border-border">
            {connectors.rows.map((row) => (
              <li key={row.id} className="bg-bg">
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col gap-2 px-4 py-3 min-h-11 hover:bg-elevated/50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm">{row.name}</span>
                    <Badge tone={connectorTone(row.state)}>{row.state}</Badge>
                  </span>
                  <span className="text-xs text-muted leading-relaxed">{row.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-muted leading-relaxed">
          Keys stay server-side. Linear HMAC uses LINEAR_WEBHOOK_SECRET when present. Hugging Face and GitHub read
          presence-only env flags and public Hub/Git APIs.
        </p>

        <ul className="divide-y divide-border border border-border">
          {issues.map((issue) => (
            <li key={issue.id}>
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 min-h-11 hover:bg-elevated/50"
              >
                <span className="micro text-subtle w-16 shrink-0">{issue.id}</span>
                <span className="flex-1 text-sm">{issue.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge tone={tone(issue.statusType)}>{issue.status}</Badge>
                  <span className="micro text-subtle hidden md:inline">{issue.priority}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-subtle" />
                </span>
              </a>
            </li>
          ))}
        </ul>

        <a
          href={LINEAR_BOARD.teamUrl}
          target="_blank"
          rel="noreferrer"
          className={cn("micro text-muted hover:text-fg underline")}
        >
          Open team {LINEAR_BOARD.teamKey} on Linear
        </a>
      </main>
    </AppShell>
  );
}
