/** Better Auth Linear Connect config without `@vercel/connect/betterauth` (eve peer). */

import { LINEAR_BETTERAUTH_PROVIDER_ID, LINEAR_CONNECT_ID } from "./ids";

export async function linearBetterAuthConfig() {
  return {
    providerId: LINEAR_BETTERAUTH_PROVIDER_ID,
    connector: LINEAR_CONNECT_ID,
    scopes: ["openid", "profile", "email"],
  };
}

export async function probeBetterAuth(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  return {
    ok: true,
    detail: `genericOAuth providerId=${LINEAR_BETTERAUTH_PROVIDER_ID} connector=${LINEAR_CONNECT_ID} (config only; eve not bundled)`,
  };
}
