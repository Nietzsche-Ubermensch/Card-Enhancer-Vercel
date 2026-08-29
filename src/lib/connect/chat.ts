/** Connect trigger auth without `@vercel/connect/chat` (that subpath pulls optional `eve` and breaks Nitro). */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { LINEAR_CONNECT_ID } from "./ids";

const OIDC_ISSUERS = [
  "https://oidc.vercel.com/matthew-bateys-projects",
  "https://oidc.vercel.com/team_XkUgv3tcKN4FQW5WLOgBmyJN",
];

function jwksFor(issuer: string) {
  return createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
}

export async function linearChatAdapter() {
  return {
    id: LINEAR_CONNECT_ID,
    async accessToken() {
      const { linearConnectToken } = await import("./core");
      return linearConnectToken();
    },
  };
}

export async function connectTriggerVerified(request: Request, _rawBody: string): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  for (const issuer of OIDC_ISSUERS) {
    try {
      await jwtVerify(token, jwksFor(issuer), { issuer });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function probeChat(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  return {
    ok: true,
    detail: "OIDC verifier via jose (no @vercel/connect/chat — eve peer omitted)",
  };
}
