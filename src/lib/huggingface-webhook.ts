import { timingSafeEqual } from "node:crypto";

const LINEAR_GQL = "https://api.linear.app/graphql";
const COMMENT_CREATE = `mutation CommentCreate($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id }
  }
}`;

export const HF_WATCH_MODEL = "hlky/RealESRGAN_x2plus" as const;

export const HF_WEBHOOK_PATH = "/webhooks/huggingface" as const;
export const HF_LINEAR_ISSUE = "JUG-19" as const;

const g = globalThis as typeof globalThis & {
  __hfWebhookInbox__?: Array<{
    id: string;
    scope: string;
    action: string;
    repo: string | null;
    receivedAt: string;
    secret: "verified" | "unsigned" | "invalid";
    linear?: { ok: boolean; detail: string };
  }>;
};

function secret() {
  const v = process.env.HF_WEBHOOK_SECRET?.trim();
  return v && v.length > 0 ? v : null;
}

/** Hugging Face sends the shared secret in X-Webhook-Secret. It is not HMAC. */
export function verifyHfWebhookSecret(secretValue: string, header: string | null) {
  if (!header) return false;
  const a = Buffer.from(secretValue);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ingestHfWebhook(input: { rawBody: string; secretHeader: string | null }) {
  const sec = secret();
  let status: "verified" | "unsigned" | "invalid" = "unsigned";
  if (sec) {
    status = verifyHfWebhookSecret(sec, input.secretHeader) ? "verified" : "invalid";
    if (status === "invalid") return { ok: false as const, status: 401, error: "invalid Hugging Face webhook secret" };
  }

  let scope = "unknown";
  let action = "unknown";
  let repo: string | null = null;
  let id = `hf-${Date.now()}`;
  try {
    const body = JSON.parse(input.rawBody) as {
      event?: { action?: string; scope?: string };
      repo?: { name?: string };
      webhook?: { id?: string };
    };
    scope = body.event?.scope ?? scope;
    action = body.event?.action ?? action;
    repo = body.repo?.name ?? null;
    if (body.webhook?.id) id = body.webhook.id;
  } catch {
    /* keep defaults */
  }

  g.__hfWebhookInbox__ ??= [];
  g.__hfWebhookInbox__.unshift({
    id,
    scope,
    action,
    repo,
    receivedAt: new Date().toISOString(),
    secret: status,
  });
  if (g.__hfWebhookInbox__.length > 50) g.__hfWebhookInbox__.length = 50;
  return { ok: true as const, id, secret: status, scope, action, repo };
}

/** Hub POSTs here. We then comment on Linear. Do not send Hub to /api/webhooks/linear (HMAC). */
export async function notifyLinearFromHf(event: {
  id: string;
  scope: string;
  action: string;
  repo: string | null;
  secret: string;
}): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.LINEAR_API_KEY?.trim() || process.env.LINEAR_API_TOKEN?.trim();
  if (!key) return { ok: false, detail: "LINEAR_API_KEY unset on Node host" };

  const headers = { Authorization: key, "Content-Type": "application/json" };
  const lookup = await fetch(LINEAR_GQL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `query($id: String!) { issue(id: $id) { id identifier url } }`,
      variables: { id: HF_LINEAR_ISSUE },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const looked = (await lookup.json()) as {
    data?: { issue?: { id: string; identifier: string; url: string } | null };
    errors?: { message: string }[];
  };
  const issue = looked.data?.issue;
  if (!issue?.id) {
    return { ok: false, detail: looked.errors?.[0]?.message ?? `${HF_LINEAR_ISSUE} not found` };
  }

  const body = [
    `HF webhook \`${event.id}\``,
    `${event.repo ?? "unknown"} · ${event.scope}/${event.action}`,
    `secret: ${event.secret}`,
    `watch: ${HF_WATCH_MODEL}`,
    `Hub URL stays ${HF_WEBHOOK_PATH} — not Linear HMAC.`,
  ].join("\n");

  const comment = await fetch(LINEAR_GQL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: COMMENT_CREATE,
      variables: { issueId: issue.id, body },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const commented = (await comment.json()) as {
    data?: { commentCreate?: { success?: boolean } };
    errors?: { message: string }[];
  };
  if (!commented.data?.commentCreate?.success) {
    return { ok: false, detail: commented.errors?.[0]?.message ?? "commentCreate failed" };
  }
  return { ok: true, detail: `${issue.identifier} ${issue.url}` };
}

export function listHfDeliveries() {
  return [...(g.__hfWebhookInbox__ ?? [])];
}

export function hfWebhookContract() {
  return {
    path: HF_WEBHOOK_PATH,
    secretPresent: Boolean(secret()),
    auth: "X-Webhook-Secret compared with HF_WEBHOOK_SECRET (shared secret, not HMAC, not Linear HMAC, not Vercel OIDC)",
    watch: HF_WATCH_MODEL,
    linearIssue: HF_LINEAR_ISSUE,
    linear: "commentCreate on JUG-19 after ingest; Hub URL is not /api/webhooks/linear",
    settings: "https://huggingface.co/settings/webhooks",
    note: "Do not point Hub at the Linear Connect trigger. Hub cannot deliver to localhost.",
    deliveries: listHfDeliveries().length,
  };
}
