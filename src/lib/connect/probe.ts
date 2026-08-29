import { probeAiSdk } from "./ai-sdk";
import { probeAuthJs } from "./authjs";
import { probeBetterAuth } from "./betterauth";
import { probeChat } from "./chat";
import { probeCore } from "./core";
import { probeEve } from "./eve";
import { LINEAR_CONNECT_ID, LINEAR_CONNECT_TRIGGER_PATH, LINEAR_CONNECT_TRIGGER_URL, LINEAR_MCP_URL } from "./ids";
import { probeMcp } from "./mcp";

export type ConnectEntrypointId = "core" | "chat" | "mcp" | "ai-sdk" | "eve" | "betterauth" | "authjs";

export type ConnectEntrypointRow = {
  id: ConnectEntrypointId;
  import: string;
  ok: boolean;
  detail: string;
};

export async function probeConnectEntrypoints() {
  const [core, chat, mcp, aiSdk, eve, betterauth, authjs] = await Promise.all([
    probeCore(),
    probeChat(),
    probeMcp(),
    probeAiSdk(),
    probeEve(),
    probeBetterAuth(),
    probeAuthJs(),
  ]);

  const rows: ConnectEntrypointRow[] = [
    { id: "core", import: "@vercel/connect", ...core },
    { id: "chat", import: "@vercel/connect/chat", ...chat },
    { id: "mcp", import: "@vercel/connect/mcp", ...mcp },
    { id: "ai-sdk", import: "@vercel/connect/ai-sdk", ...aiSdk },
    { id: "eve", import: "@vercel/connect/eve", ...eve },
    { id: "betterauth", import: "@vercel/connect/betterauth", ...betterauth },
    { id: "authjs", import: "@vercel/connect/authjs", ...authjs },
  ];

  return {
    ok: true,
    connector: LINEAR_CONNECT_ID,
    subject: "app",
    trigger: LINEAR_CONNECT_TRIGGER_URL,
    path: LINEAR_CONNECT_TRIGGER_PATH,
    mcp: LINEAR_MCP_URL,
    live: rows.filter((r) => r.ok).length,
    total: rows.length,
    rows,
  };
}
