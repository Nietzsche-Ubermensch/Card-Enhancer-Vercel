/** AI SDK MCP without `@vercel/connect/ai-sdk` (eve peer). xAI stays the generator. */

import { LINEAR_MCP_URL } from "./ids";
import { linearMcpAuthProvider } from "./mcp";

export async function linearAiSdkAuthProvider() {
  return linearMcpAuthProvider();
}

export async function linearMcpClient() {
  const { createMCPClient } = await import("@ai-sdk/mcp");
  const authProvider = await linearAiSdkAuthProvider();
  return createMCPClient({
    transport: {
      type: "http",
      url: LINEAR_MCP_URL,
      authProvider: authProvider as never,
    },
  });
}

export async function probeAiSdk(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const provider = await linearAiSdkAuthProvider();
    const tokens = await provider.tokens();
    const access = Boolean(tokens?.access_token);
    return {
      ok: access,
      detail: access
        ? `ai-sdk MCP ${LINEAR_MCP_URL} via core token`
        : "ai-sdk connectAuthProvider not bundled (eve); xAI remains generator",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
