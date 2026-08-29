/** `@vercel/connect/eve` Linear credentials. Falls back to chat OIDC verifier if `eve` isn't installed. */

import { LINEAR_CONNECT_ID } from "./ids";

export async function linearEveCredentials() {
  try {
    const { connectLinearCredentials } = await import("@vercel/connect/eve");
    return { source: "eve" as const, credentials: connectLinearCredentials(LINEAR_CONNECT_ID) };
  } catch {
    const { connectLinearAdapter } = await import("@vercel/connect/chat");
    return { source: "chat-shape" as const, credentials: connectLinearAdapter(LINEAR_CONNECT_ID) };
  }
}

export async function probeEve(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const { source, credentials } = await linearEveCredentials();
    const token = await credentials.accessToken();
    return {
      ok: Boolean(token),
      detail: token ? `connectLinearCredentials via ${source}` : "empty token",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
