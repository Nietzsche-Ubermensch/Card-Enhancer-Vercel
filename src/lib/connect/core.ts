/** `@vercel/connect` core: token, metadata, authorize, revoke. Server-only. */

import { LINEAR_APP_SUBJECT, LINEAR_CONNECT_ID } from "./ids";

export async function linearConnectToken(): Promise<string | null> {
  try {
    const { getToken } = await import("@vercel/connect");
    const token = await getToken(LINEAR_CONNECT_ID, { subject: LINEAR_APP_SUBJECT });
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function linearConnectTokenResponse() {
  const { getTokenResponse } = await import("@vercel/connect");
  return getTokenResponse(LINEAR_CONNECT_ID, { subject: LINEAR_APP_SUBJECT });
}

export async function linearConnectMetadata() {
  const { getConnectorMetadata } = await import("@vercel/connect");
  return getConnectorMetadata(LINEAR_CONNECT_ID);
}

export async function linearStartAuthorization(returnUrl?: string) {
  const { startAuthorization } = await import("@vercel/connect");
  return startAuthorization(LINEAR_CONNECT_ID, { subject: LINEAR_APP_SUBJECT }, { callbackUrl: returnUrl });
}

export async function linearRevokeToken() {
  const { revokeToken } = await import("@vercel/connect");
  await revokeToken(LINEAR_CONNECT_ID, { subject: LINEAR_APP_SUBJECT });
}

export async function linearStartInstallation(returnUrl?: string) {
  const { experimental_startInstallation } = await import("@vercel/connect");
  return experimental_startInstallation(LINEAR_CONNECT_ID, {}, { returnUrl });
}

export async function probeCore(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const [meta, tok] = await Promise.allSettled([linearConnectMetadata(), linearConnectTokenResponse()]);
    const metaOk = meta.status === "fulfilled";
    const tokOk = tok.status === "fulfilled";
    if (tokOk) {
      const t = tok.value;
      return {
        ok: true,
        detail: `${t.connector.uid} · ${t.connector.type} · expires ${new Date(t.expiresAt).toISOString()}${metaOk ? ` · ${meta.value.name}` : ""}`,
      };
    }
    const err = tok.status === "rejected" ? String(tok.reason instanceof Error ? tok.reason.message : tok.reason) : "no token";
    return { ok: false, detail: err.slice(0, 180) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
