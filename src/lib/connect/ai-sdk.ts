/** `@vercel/connect/ai-sdk` — same MCP provider, Linear tools via @ai-sdk/mcp. xAI only. */

import { LINEAR_APP_SUBJECT, LINEAR_CONNECT_ID, LINEAR_MCP_URL } from "./ids";

export async function linearAiSdkAuthProvider() {
  const { connectAuthProvider } = await import("@vercel/connect/ai-sdk");
  return connectAuthProvider(LINEAR_CONNECT_ID, { subject: LINEAR_APP_SUBJECT });
}

export async function linearMcpClient() {
  const { createMCPClient } = await import("@ai-sdk/mcp");
  const authProvider = await linearAiSdkAuthProvider();
  return createMCPClient({
    transport: {
      type: "http",
      url: LINEAR_MCP_URL,
      authProvider,
    },
  });
}

export async function probeAiSdk(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const provider = await linearAiSdkAuthProvider();
    const tokens = await provider.tokens?.();
    const access = tokens && "access_token" in tokens ? Boolean(tokens.access_token) : false;
    if (!access) return { ok: false, detail: "ai-sdk connectAuthProvider: no access_token" };
    try {
      const client = await linearMcpClient();
      const tools = await client.tools();
      const names = Object.keys(tools);
      return { ok: true, detail: `ai-sdk MCP ${LINEAR_MCP_URL} · ${names.length} tools` };
    } catch (inner) {
      return {
        ok: true,
        detail: `ai-sdk auth ok · tools: ${(inner instanceof Error ? inner.message : String(inner)).slice(0, 120)}`,
      };
    }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
