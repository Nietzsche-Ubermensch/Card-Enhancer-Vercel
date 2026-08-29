#!/usr/bin/env node
/**
 * Grok Build MCP — stdio JSON-RPC. Ten tools. No secrets in files.
 * Default model grok-4.6; art grok-imagine-image-2.0.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const PROTOCOL = "2025-11-25";
const DEFAULT_MODEL = process.env.GROK_BUILD_DEFAULT_MODEL?.trim() || "grok-4.6";
const PLUGIN_DATA =
  process.env.GROK_BUILD_PLUGIN_DATA?.trim() || join(homedir(), ".grok", "plugin-data", "grok-build");
const XAI_BASE = process.env.GROK_BUILD_XAI_BASE_URL?.trim() || "https://api.x.ai/v1";
const TTS_BASE = process.env.GROK_BUILD_TTS_BASE_URL?.trim() || "https://api.x.ai/v1/tts";
const AUTH_PATH = process.env.GROK_BUILD_GROK_AUTH_PATH?.trim() || join(homedir(), ".grok");
const XAI_TIMEOUT_MS = Number(process.env.GROK_BUILD_XAI_TIMEOUT_MS || 120000);
const TOOL_TIMEOUT_MS = Number(process.env.GROK_BUILD_TOOL_TIMEOUT_MS || 180000);
const HANDSHAKE_TIMEOUT_MS = Number(process.env.GROK_BUILD_HANDSHAKE_TIMEOUT_MS || 15000);
const NODE_BIN = process.env.GROK_BUILD_NODE?.trim() || process.execPath;
const CWD = process.env.GROK_BUILD_CWD?.trim() || process.cwd();
const TS_RULE = "Always use TypeScript. Prefer functional components.";

type Job = {
  id: string;
  tool: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  pid?: number;
  startedAt: string;
  finishedAt?: string;
  result?: string;
};

function allowWrite() {
  return process.env.GROK_BUILD_ALLOW_WRITE === "true";
}
function allowAlwaysApprove() {
  return process.env.GROK_BUILD_ALLOW_ALWAYS_APPROVE === "true";
}
function apiFallback() {
  return process.env.GROK_BUILD_API_FALLBACK === "true";
}
function xaiKey() {
  return process.env.XAI_API_KEY?.trim() || "";
}

function jobsDir() {
  mkdirSync(PLUGIN_DATA, { recursive: true });
  return PLUGIN_DATA;
}
function jobPath(id: string) {
  return join(jobsDir(), `${id}.json`);
}
function writeJob(job: Job) {
  writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
}
function readJob(id: string): Job | null {
  const p = jobPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Job;
}
function listJobs(): Job[] {
  return readdirSync(jobsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(jobsDir(), f), "utf8")) as Job)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function runGrok(args: string[], opts?: { timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string; pid?: number }> {
  return new Promise((resolve) => {
    const child = spawn("grok", args, {
      cwd: CWD,
      env: { ...process.env, GROK_HOME: AUTH_PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts?.timeoutMs ?? TOOL_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr, pid: child.pid });
    });
  });
}

async function xaiPost(path: string, body: unknown) {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY unset on Node host (never VITE_*)");
  const url = path.startsWith("http") ? path : `${XAI_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`xAI ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

const TOOLS = [
  {
    name: "grok_build_setup",
    description: "Check grok CLI, model, auth path, write policy, fallback, plugin data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "grok_build_prompt",
    description: "Read-only Grok prompt in the workspace. No file writes.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" }, model: { type: "string" } },
      required: ["prompt"],
    },
  },
  {
    name: "grok_build_review",
    description: "Read-only review of path-filtered git/workspace context.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" }, paths: { type: "array", items: { type: "string" } } },
      required: ["prompt"],
    },
  },
  {
    name: "grok_build_task",
    description: "Bounded Grok task. Writes require GROK_BUILD_ALLOW_WRITE=true.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        write: { type: "boolean" },
        alwaysApprove: { type: "boolean" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "grok_build_image",
    description: "Generate an image with grok-imagine-image-2.0 via xAI REST.",
    inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
  },
  {
    name: "grok_build_video",
    description: "Generate a short video via xAI Imagine video endpoint.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" }, duration: { type: "string" } },
      required: ["prompt"],
    },
  },
  {
    name: "grok_build_tts",
    description: "Text-to-speech via GROK_BUILD_TTS_BASE_URL. Token is XAI_API_KEY.",
    inputSchema: { type: "object", properties: { text: { type: "string" }, voice: { type: "string" } }, required: ["text"] },
  },
  {
    name: "grok_build_status",
    description: "List stored jobs for this plugin-data directory.",
    inputSchema: { type: "object", properties: { all: { type: "boolean" } } },
  },
  {
    name: "grok_build_result",
    description: "Return stored result for a finished job id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "grok_build_cancel",
    description: "Cancel a job and mark its lock released.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
] as const;

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "grok_build_setup": {
      const grok = await runGrok(["--version"], { timeoutMs: HANDSHAKE_TIMEOUT_MS }).catch(() => null);
      return JSON.stringify(
        {
          ok: true,
          cwd: CWD,
          node: NODE_BIN,
          grok: grok?.stdout.trim() || grok?.stderr.trim() || "missing",
          model: DEFAULT_MODEL,
          imageModel: "grok-imagine-image-2.0",
          pluginData: PLUGIN_DATA,
          authPath: AUTH_PATH,
          xaiBase: XAI_BASE,
          ttsBase: TTS_BASE,
          timeouts: {
            handshakeMs: HANDSHAKE_TIMEOUT_MS,
            toolMs: TOOL_TIMEOUT_MS,
            xaiMs: XAI_TIMEOUT_MS,
          },
          keys: { XAI_API_KEY: Boolean(xaiKey()) },
          policy: {
            allowWrite: allowWrite(),
            alwaysApprove: allowAlwaysApprove(),
            apiFallback: apiFallback(),
            readOnlyDefault: true,
          },
          rule: TS_RULE,
        },
        null,
        2,
      );
    }
    case "grok_build_prompt": {
      const prompt = String(args.prompt || "");
      const model = String(args.model || DEFAULT_MODEL);
      const r = await runGrok(["--cwd", CWD, "--rules", TS_RULE, "--deny", "Write,Edit,Bash", prompt]);
      return JSON.stringify({ ok: r.code === 0, model, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-2000) });
    }
    case "grok_build_review": {
      const prompt = String(args.prompt || "");
      const paths = Array.isArray(args.paths) ? (args.paths as string[]).join(", ") : "";
      const r = await runGrok([
        "--cwd",
        CWD,
        "--rules",
        TS_RULE,
        "--deny",
        "Write,Edit,Bash",
        `Read-only review. Paths: ${paths}\n${prompt}`,
      ]);
      return JSON.stringify({ ok: r.code === 0, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-2000) });
    }
    case "grok_build_task": {
      const wantWrite = args.write === true;
      if (wantWrite && !allowWrite()) {
        return JSON.stringify({ ok: false, error: "GROK_BUILD_ALLOW_WRITE is not true" });
      }
      const always = args.alwaysApprove === true;
      if (always && !allowAlwaysApprove()) {
        return JSON.stringify({ ok: false, error: "GROK_BUILD_ALLOW_ALWAYS_APPROVE is not true" });
      }
      const id = randomUUID();
      const job: Job = { id, tool: "grok_build_task", status: "running", startedAt: new Date().toISOString() };
      writeJob(job);
      const flags = ["--cwd", CWD, "--rules", TS_RULE];
      if (always && allowAlwaysApprove()) flags.push("--always-approve");
      if (!wantWrite) flags.push("--deny", "Write,Edit");
      const r = await runGrok([...flags, String(args.prompt || "")]);
      const ttyFail = /No such device or address|os error 6/i.test(r.stdout + r.stderr);
      if (r.code !== 0 && ttyFail && apiFallback()) {
        const raw = await xaiPost("/chat/completions", {
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: String(args.prompt || "") }],
        });
        job.status = "done";
        job.finishedAt = new Date().toISOString();
        job.result = raw.slice(0, 12000);
        job.pid = r.pid;
        writeJob(job);
        return JSON.stringify({ ok: true, id, status: "done", fallback: "xai-api", result: raw.slice(0, 4000) });
      }
      job.status = r.code === 0 ? "done" : "error";
      job.finishedAt = new Date().toISOString();
      job.result = (r.stdout + "\n" + r.stderr).slice(-12000);
      job.pid = r.pid;
      writeJob(job);
      return JSON.stringify({ ok: r.code === 0, id, status: job.status, result: job.result?.slice(-4000) });
    }
    case "grok_build_image": {
      const text = await xaiPost("/images/generations", {
        model: "grok-imagine-image-2.0",
        prompt: String(args.prompt || ""),
      });
      return text.slice(0, 8000);
    }
    case "grok_build_video": {
      const text = await xaiPost("/videos/generations", {
        model: "grok-imagine-video",
        prompt: String(args.prompt || ""),
        duration: args.duration || "6",
      });
      return text.slice(0, 8000);
    }
    case "grok_build_tts": {
      const text = await xaiPost(TTS_BASE, { text: String(args.text || ""), voice: args.voice || "default" });
      return text.slice(0, 4000);
    }
    case "grok_build_status": {
      const jobs = listJobs();
      const rows = args.all === true ? jobs : jobs.filter((j) => j.status === "running" || j.status === "queued");
      return JSON.stringify({ ok: true, jobs: rows }, null, 2);
    }
    case "grok_build_result": {
      const job = readJob(String(args.id || ""));
      if (!job) return JSON.stringify({ ok: false, error: "unknown job" });
      return JSON.stringify(job, null, 2);
    }
    case "grok_build_cancel": {
      const job = readJob(String(args.id || ""));
      if (!job) return JSON.stringify({ ok: false, error: "unknown job" });
      if (job.pid) {
        try {
          process.kill(job.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
      job.status = "cancelled";
      job.finishedAt = new Date().toISOString();
      writeJob(job);
      return JSON.stringify({ ok: true, id: job.id, status: job.status });
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

type Rpc = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: unknown };

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function onMessage(msg: Rpc) {
  if (!msg.method) return;
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "grok-build", version: "1.0.0" },
      },
    });
    return;
  }
  if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") return;
  if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === "tools/call") {
    const p = (msg.params || {}) as { name?: string; arguments?: Record<string, unknown> };
    try {
      const text = await handleTool(p.name || "", p.arguments || {});
      send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
    } catch (e) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { isError: true, content: [{ type: "text", text: String(e instanceof Error ? e.message : e) }] },
      });
    }
    return;
  }
  if (msg.method === "ping") {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }
}

function main() {
  mkdirSync(PLUGIN_DATA, { recursive: true });
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      void onMessage(JSON.parse(trimmed) as Rpc);
    } catch {
      /* ignore malformed */
    }
  });
}

export { TOOLS, allowWrite, allowAlwaysApprove, handleTool };
main();
