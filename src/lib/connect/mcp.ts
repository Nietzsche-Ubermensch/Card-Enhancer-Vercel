/** MCP provider without `@vercel/connect/mcp` (pulls eve). Token is core getToken. */

import { LINEAR_CONNECT_ID, LINEAR_MCP_URL } from "./ids";
import { linearConnectToken } from "./core";

export async function linearMcpAuthProvider() {
  return {
    connector: LINEAR_CONNECT_ID,
    redirectUrl: LINEAR_MCP_URL,
    tokens: async () => {
      const access_token = await linearConnectToken();
      return access_token ? { access_token } : undefined;
    },
  };
}

export async function probeMcp(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const token = await linearConnectToken();
    return {
      ok: Boolean(token),
      detail: token
        ? `MCP ${LINEAR_MCP_URL} via core token`
        : `MCP ${LINEAR_MCP_URL} — connect/mcp not bundled (eve peer)`,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
