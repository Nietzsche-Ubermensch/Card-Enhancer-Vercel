import { createHmac, timingSafeEqual } from "node:crypto";

export const GITHUB_WEBHOOK_PATH = "/webhooks/github" as const;

const g = globalThis as typeof globalThis & {
  __githubWebhookInbox__?: Array<{
    id: string;
    event: string;
    delivery: string;
    receivedAt: string;
    signature: "verified" | "unsigned" | "invalid";
  }>;
};

function secret() {
  const v = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  return v && v.length > 0 ? v : null;
}

export function verifyGitHubSignature(secretValue: string, signatureHeader: string | null, rawBody: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secretValue).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ingestGitHubWebhook(input: {
  rawBody: string;
  event: string | null;
  delivery: string | null;
  signature: string | null;
}) {
  const sec = secret();
  let status: "verified" | "unsigned" | "invalid" = "unsigned";
  if (sec) {
    status = verifyGitHubSignature(sec, input.signature, input.rawBody) ? "verified" : "invalid";
    if (status === "invalid") return { ok: false as const, status: 401, error: "invalid GitHub signature" };
  }
  const id = input.delivery || `gh-${Date.now()}`;
  g.__githubWebhookInbox__ ??= [];
  g.__githubWebhookInbox__.unshift({
    id,
    event: input.event || "unknown",
    delivery: id,
    receivedAt: new Date().toISOString(),
    signature: status,
  });
  if (g.__githubWebhookInbox__.length > 50) g.__githubWebhookInbox__.length = 50;
  return { ok: true as const, id, signature: status };
}

export function listGitHubDeliveries() {
  return [...(g.__githubWebhookInbox__ ?? [])];
}

export function githubWebhookContract() {
  return {
    path: GITHUB_WEBHOOK_PATH,
    secretPresent: Boolean(secret()),
    hmac: "X-Hub-Signature-256 = sha256=HMAC-SHA256(raw body, GITHUB_WEBHOOK_SECRET)",
    note: "GitHub cannot deliver to http://localhost:8644. Use a public HTTPS Nitro origin.",
    deliveries: listGitHubDeliveries().length,
  };
}
