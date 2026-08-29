/** `@vercel/connect/chat` — Linear adapter + OIDC webhook verifier. */

import { LINEAR_CONNECT_ID } from "./ids";

export async function linearChatAdapter() {
  const { connectLinearAdapter } = await import("@vercel/connect/chat");
  return connectLinearAdapter(LINEAR_CONNECT_ID);
}

export async function connectTriggerVerified(request: Request, rawBody: string): Promise<boolean> {
  const { createConnectWebhookVerifier } = await import("@vercel/connect/chat");
  const verifier = createConnectWebhookVerifier();
  try {
    const ok = await verifier(request, rawBody);
    return Boolean(ok);
  } catch {
    return false;
  }
}

export async function probeChat(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  try {
    const adapter = await linearChatAdapter();
    const token = await adapter.accessToken();
    return { ok: Boolean(token), detail: token ? "connectLinearAdapter accessToken + OIDC webhookVerifier" : "empty token" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 180) : String(e) };
  }
}
