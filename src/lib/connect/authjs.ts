/** `@vercel/connect/authjs` — Auth.js OAuth2Config. App auth stays Better Auth. */

import { LINEAR_CONNECT_ID } from "./ids";

export async function linearAuthJsProvider() {
  const { connect } = await import("@vercel/connect/authjs");
  return connect({
    id: "linear-connect",
    name: "Linear (Vercel Connect)",
    connector: LINEAR_CONNECT_ID,
    scopes: ["openid", "profile", "email"],
  });
}

export async function probeAuthJs(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const provider = await linearAuthJsProvider();
    const id = (provider as { id?: string }).id ?? "linear-connect";
    return { ok: true, detail: `Auth.js OAuth2Config id=${id} connector=${LINEAR_CONNECT_ID}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
