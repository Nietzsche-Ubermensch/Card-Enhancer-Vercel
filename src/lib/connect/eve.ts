/** Eve Linear credentials without importing `@vercel/connect/eve` (optional peer, Nitro-breaking). */

import { LINEAR_CONNECT_ID } from "./ids";
import { linearConnectToken } from "./core";

export async function linearEveCredentials() {
  return {
    source: "core-token" as const,
    credentials: {
      connector: LINEAR_CONNECT_ID,
      accessToken: linearConnectToken,
    },
  };
}

export async function probeEve(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const token = await linearConnectToken();
    return {
      ok: Boolean(token),
      detail: token
        ? "connectLinearCredentials via core getToken (eve package not installed)"
        : "eve peer omitted; core token empty until OIDC on hermes",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
