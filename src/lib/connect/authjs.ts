/** Auth.js config without `@vercel/connect/authjs`. App auth stays Better Auth. */

import { LINEAR_CONNECT_ID } from "./ids";

export async function linearAuthJsProvider() {
  return {
    id: "linear-connect",
    name: "Linear (Vercel Connect)",
    connector: LINEAR_CONNECT_ID,
    type: "oauth",
    scopes: ["openid", "profile", "email"],
  };
}

export async function probeAuthJs(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  return {
    ok: true,
    detail: `Auth.js OAuth2Config id=linear-connect connector=${LINEAR_CONNECT_ID} (config only; eve not bundled)`,
  };
}
