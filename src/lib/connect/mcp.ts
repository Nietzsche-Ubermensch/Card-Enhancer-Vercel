/** `@vercel/connect/mcp` — Linear MCP OAuthClientProvider. */

import { LINEAR_APP_SUBJECT, LINEAR_CONNECT_ID, LINEAR_MCP_URL } from "./ids";

export async function linearMcpAuthProvider() {
  const { connectAuthProvider } = await import("@vercel/connect/mcp");
  return connectAuthProvider(LINEAR_CONNECT_ID, {
    subject: LINEAR_APP_SUBJECT,
    redirectUrl: LINEAR_MCP_URL,
  });
}

export async function probeMcp(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const provider = await linearMcpAuthProvider();
    const tokens = await provider.tokens?.();
    const access = tokens && "access_token" in tokens ? Boolean(tokens.access_token) : false;
    return {
      ok: access,
      detail: access ? `connectAuthProvider ${LINEAR_MCP_URL}` : "MCP provider has no access_token yet",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
