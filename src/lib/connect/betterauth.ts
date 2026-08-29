/** `@vercel/connect/betterauth` — GenericOAuth config for Linear Connect. */

import { LINEAR_BETTERAUTH_PROVIDER_ID, LINEAR_CONNECT_ID } from "./ids";

export async function linearBetterAuthConfig() {
  const { connect } = await import("@vercel/connect/betterauth");
  return connect({
    providerId: LINEAR_BETTERAUTH_PROVIDER_ID,
    connector: LINEAR_CONNECT_ID,
    scopes: ["openid", "profile", "email"],
  });
}

export async function probeBetterAuth(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const cfg = await linearBetterAuthConfig();
    const id = (cfg as { providerId?: string }).providerId ?? LINEAR_BETTERAUTH_PROVIDER_ID;
    return { ok: true, detail: `genericOAuth providerId=${id} connector=${LINEAR_CONNECT_ID}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
