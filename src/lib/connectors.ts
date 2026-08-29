import { createServerFn } from "@tanstack/react-start";
import { AI_PROVIDER_META, AI_PROVIDERS } from "./ai/provider";
import { hasKey } from "./ai/keys";
import { GIT_PIPELINE, HF_BATCH_BACKEND, OUTPUT_PRESETS } from "./sports-card";
import { LINEAR_BOARD } from "./linear-board";
import { LINEAR_CONNECT_ID } from "./connect/ids";
import { loadLinearJobs } from "./linear-jobs";
import { hasEnv, githubHeaders, huggingfaceHeaders } from "./remote-auth";

export type ConnectorKind = "ai" | "hub" | "git" | "compute" | "jobs";
export type ConnectorState = "live" | "entitled" | "protocol" | "missing";

export type ConnectorRow = {
  id: string;
  name: string;
  kind: ConnectorKind;
  state: ConnectorState;
  detail: string;
  href: string;
};

export async function runConnectorProbe(): Promise<{ rows: ConnectorRow[]; live: number; total: number }> {
  const [hf, git, jobs] = await Promise.allSettled([
    fetch("https://huggingface.co/api/models/hlky/RealESRGAN_x2plus", {
      headers: huggingfaceHeaders(),
      signal: AbortSignal.timeout(8000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { downloads?: number; id?: string };
    }),
    fetch(`https://api.github.com/repos/${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { full_name?: string; default_branch?: string };
    }),
    loadLinearJobs(),
  ]);

  const aiRows: ConnectorRow[] = AI_PROVIDERS.map((id) => {
    const meta = AI_PROVIDER_META[id];
    const present = hasKey(id);
    return {
      id,
      name: id,
      kind: "ai",
      state: present ? "entitled" : "missing",
      detail: present
        ? `${meta.chatModel} · ${meta.imageModel} · env ${meta.env}`
        : `No ${meta.env} on this Node host`,
      href: "https://docs.x.ai",
    };
  });

  const hfLive = hf.status === "fulfilled";
  const gitLive = git.status === "fulfilled";
  const linear = jobs.status === "fulfilled" ? jobs.value : null;
  const dpi = Object.keys(OUTPUT_PRESETS).join("/");
  const hmac = hasEnv("LINEAR_WEBHOOK_SECRET") ? "HMAC on" : "HMAC unsigned";

  const pipeline: ConnectorRow[] = [
    {
      id: "huggingface",
      name: "Hugging Face",
      kind: "hub",
      state: hfLive ? "live" : "protocol",
      detail: hfLive
        ? `${hf.value.id ?? HF_BATCH_BACKEND.id} · ${hf.value.downloads != null ? `${hf.value.downloads} downloads` : "Hub"} · RRDBNet ×${HF_BATCH_BACKEND.scale}`
        : `${HF_BATCH_BACKEND.id} recipe · Hub probe failed`,
      href: HF_BATCH_BACKEND.url,
    },
    {
      id: "github",
      name: "GitHub / GitMCP",
      kind: "git",
      state: gitLive ? "live" : "protocol",
      detail: gitLive
        ? `${git.value.full_name ?? `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`} · ${GIT_PIPELINE.cli} --resume`
        : `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo} gigapixel/batch.py protocol`,
      href: GIT_PIPELINE.fileUrl,
    },
    {
      id: "wolfram",
      name: "Wolfram",
      kind: "compute",
      state: "protocol",
      detail: `2.5 in × 3.5 in → ${dpi} dpi (${OUTPUT_PRESETS[300].width}×${OUTPUT_PRESETS[300].height} @ 300)`,
      href: "https://www.wolframalpha.com/input?i=2.5+inches+*+300+dpi",
    },
    {
      id: "linear",
      name: "Linear",
      kind: "jobs",
      state: linear?.source === "live" ? "live" : "protocol",
      detail: linear
        ? `${LINEAR_BOARD.teamKey} · ${linear.counts.done} done · ${linear.counts.open} open · ${linear.source} · ${hmac}`
        : `${LINEAR_BOARD.teamKey} · snapshot · ${hmac}`,
      href: LINEAR_BOARD.projectUrl,
    },
    {
      id: "vercel-connect",
      name: "Vercel Connect",
      kind: "jobs",
      state: linear?.source === "live" ? "live" : "protocol",
      detail: `${LINEAR_CONNECT_ID} · app token · OIDC /triggers/linear · HMAC /api/webhooks/linear`,
      href: "https://vercel.com/docs/connect",
    },
  ];

  const rows = [...aiRows, ...pipeline];
  const live = rows.filter((r) => r.state === "live" || r.state === "entitled").length;
  return { rows, live, total: rows.length };
}

export const probeConnectors = createServerFn({ method: "GET" }).handler(async () => runConnectorProbe());
