import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const LINEAR_RESOURCE_TYPES = [
  "Issue",
  "Comment",
  "IssueLabel",
  "Attachment",
  "Reaction",
  "Project",
  "ProjectUpdate",
  "Document",
  "Initiative",
  "InitiativeUpdate",
  "Cycle",
  "Customer",
  "CustomerNeed",
  "User",
  "IssueSLA",
  "OAuthApp",
] as const;

export const LINEAR_WEBHOOK_RETRIES = [
  { attempt: 1, delay: "1 minute" },
  { attempt: 2, delay: "1 hour" },
  { attempt: 3, delay: "6 hours" },
] as const;

export const LINEAR_WEBHOOK_IPS = [
  "35.231.147.226",
  "35.243.134.228",
  "35.196.141.51",
  "34.140.253.14",
  "34.38.87.206",
  "34.62.119.29",
  "34.134.222.122",
  "35.222.25.142",
  "34.60.255.158",
] as const;

export const LINEAR_WEBHOOK_CREATE = `mutation {
  webhookCreate(input: {
    url: "https://YOUR_HOST/api/webhooks/linear"
    teamId: "bc805575-ad97-4c4a-b316-e42c2ad05ed4"
    resourceTypes: ["Issue", "Comment", "Project"]
    label: "Card Enhancer Jobs"
  }) {
    success
    webhook { id enabled }
  }
}`;

export const linearWebhookPayloadSchema = z.object({
  action: z.enum(["create", "update", "remove", "set", "highRisk", "breached"]),
  type: z.string().min(1).max(80),
  actor: z
    .object({
      id: z.string().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
      url: z.string().optional(),
    })
    .nullable()
    .optional(),
  createdAt: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  url: z.string().optional(),
  updatedFrom: z.record(z.string(), z.unknown()).optional(),
  webhookTimestamp: z.number().optional(),
  webhookId: z.string().optional(),
  organizationId: z.string().optional(),
  issueData: z.record(z.string(), z.unknown()).optional(),
});

export type LinearWebhookPayload = z.infer<typeof linearWebhookPayloadSchema>;
export type SignatureStatus = "verified" | "unsigned" | "invalid";

export type LinearDelivery = {
  id: string;
  receivedAt: string;
  source: "linear" | "replay";
  signature: SignatureStatus;
  event: string;
  action: string;
  type: string;
  identifier: string;
  title: string;
  state: string;
  actor: string;
  url?: string;
  changed: string[];
};

const INBOX_CAP = 50;
const FRESH_MS = 60_000;

const g = globalThis as typeof globalThis & { __linearWebhookInbox?: LinearDelivery[] };
if (!g.__linearWebhookInbox) g.__linearWebhookInbox = [];

export function webhookSecret(): string | null {
  return process.env.LINEAR_WEBHOOK_SECRET || null;
}

export function webhookSecretPresent(): boolean {
  return Boolean(process.env.LINEAR_WEBHOOK_SECRET);
}

export function signLinearBody(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyLinearSignature(secret: string, header: string | null, rawBody: string): boolean {
  if (!header || !/^[0-9a-fA-F]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const got = Buffer.from(header, "hex");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

export function timestampFresh(ts: number | undefined, now = Date.now(), windowMs = FRESH_MS): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= windowMs;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summarize(payload: LinearWebhookPayload, eventHeader: string | null): Omit<LinearDelivery, "id" | "receivedAt" | "source" | "signature"> {
  const data = payload.data ?? payload.issueData ?? {};
  const stateRaw = data.state;
  const state =
    typeof stateRaw === "object" && stateRaw && "name" in stateRaw
      ? str((stateRaw as { name?: unknown }).name)
      : str(stateRaw);
  return {
    event: eventHeader || payload.type,
    action: payload.action,
    type: payload.type,
    identifier: str(data.identifier) || str(data.id).slice(0, 8) || payload.type,
    title: str(data.title) || str(data.body).slice(0, 80) || str(data.name) || payload.type,
    state,
    actor: payload.actor?.name ?? "unknown",
    url: payload.url,
    changed: payload.updatedFrom ? Object.keys(payload.updatedFrom) : [],
  };
}

export type IngestInput = {
  rawBody: string;
  signature: string | null;
  eventHeader: string | null;
  timestampHeader: string | null;
  delivery: string | null;
  userAgent: string | null;
  secret: string | null;
  now?: number;
  source?: "linear" | "replay";
};

export type IngestResult =
  | { ok: true; event: LinearDelivery }
  | { ok: false; status: number; error: string };

export function ingestLinearWebhook(input: IngestInput): IngestResult {
  const now = input.now ?? Date.now();
  const source = input.source ?? "linear";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }

  const parsed = linearWebhookPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid linear payload" };
  }

  let signature: SignatureStatus = "unsigned";
  if (input.secret) {
    const goodSig = verifyLinearSignature(input.secret, input.signature, input.rawBody);
    if (!goodSig) return { ok: false, status: 401, error: "invalid Linear-Signature" };
    const headerTs = input.timestampHeader ? Number(input.timestampHeader) : undefined;
    const fresh = timestampFresh(parsed.data.webhookTimestamp, now) || timestampFresh(headerTs, now);
    if (source === "linear" && !fresh) return { ok: false, status: 401, error: "stale webhookTimestamp" };
    signature = "verified";
  }

  const inbox = g.__linearWebhookInbox!;
  const id = input.delivery || parsed.data.webhookId || randomUUID();
  if (inbox.some((e) => e.id === id)) {
    return { ok: true, event: inbox.find((e) => e.id === id)! };
  }

  const event: LinearDelivery = {
    id,
    receivedAt: new Date(now).toISOString(),
    source,
    signature,
    ...summarize(parsed.data, input.eventHeader),
  };
  inbox.unshift(event);
  if (inbox.length > INBOX_CAP) inbox.length = INBOX_CAP;
  return { ok: true, event };
}

export function listLinearDeliveries(): LinearDelivery[] {
  return [...(g.__linearWebhookInbox ?? [])];
}

export function clearLinearDeliveries() {
  if (g.__linearWebhookInbox) g.__linearWebhookInbox.length = 0;
}

export type ReplaySample = "issue.update" | "issue.create" | "comment.create";

export function sampleLinearPayload(kind: ReplaySample, now = Date.now()): LinearWebhookPayload {
  const createdAt = new Date(now).toISOString();
  if (kind === "comment.create") {
    return {
      action: "create",
      type: "Comment",
      actor: { id: "5f9b63f6-1563-4f15-8241-6367a238613a", type: "user", name: "Matthew" },
      createdAt,
      data: {
        id: randomUUID(),
        createdAt,
        updatedAt: createdAt,
        body: "HMAC inbox verified against Linear Issue/Comment payload.",
        issueId: "JUG-15",
        identifier: "JUG-15",
        title: "Linear API webhooks · HMAC inbox + Jobs deliveries",
      },
      url: "https://linear.app/bateyjules/issue/JUG-15/linear-api-webhooks-hmac-inbox-jobs-deliveries",
      webhookTimestamp: now,
      webhookId: randomUUID(),
      organizationId: "218107f2-006d-4b41-b4d4-652d76147eec",
    };
  }
  if (kind === "issue.create") {
    return {
      action: "create",
      type: "Issue",
      actor: { id: "5f9b63f6-1563-4f15-8241-6367a238613a", type: "user", name: "Matthew" },
      createdAt,
      data: {
        id: randomUUID(),
        identifier: "JUG-15",
        title: "Linear API webhooks · HMAC inbox + Jobs deliveries",
        state: { name: "In Progress", type: "started" },
        teamId: "bc805575-ad97-4c4a-b316-e42c2ad05ed4",
        projectId: "a6160086-387d-46cd-9611-08686d638a83",
      },
      url: "https://linear.app/bateyjules/issue/JUG-15/linear-api-webhooks-hmac-inbox-jobs-deliveries",
      webhookTimestamp: now,
      webhookId: randomUUID(),
      organizationId: "218107f2-006d-4b41-b4d4-652d76147eec",
    };
  }
  return {
    action: "update",
    type: "Issue",
    actor: { id: "5f9b63f6-1563-4f15-8241-6367a238613a", type: "user", name: "Matthew" },
    createdAt,
    data: {
      id: randomUUID(),
      identifier: "JUG-15",
      title: "Linear API webhooks · HMAC inbox + Jobs deliveries",
      state: { name: "Done", type: "completed" },
      teamId: "bc805575-ad97-4c4a-b316-e42c2ad05ed4",
      projectId: "a6160086-387d-46cd-9611-08686d638a83",
    },
    url: "https://linear.app/bateyjules/issue/JUG-15/linear-api-webhooks-hmac-inbox-jobs-deliveries",
    updatedFrom: { stateId: "started", completedAt: null },
    webhookTimestamp: now,
    webhookId: randomUUID(),
    organizationId: "218107f2-006d-4b41-b4d4-652d76147eec",
  };
}

export function replayLinearSample(kind: ReplaySample, secret: string | null, now = Date.now()): IngestResult {
  const payload = sampleLinearPayload(kind, now);
  const rawBody = JSON.stringify(payload);
  const signature = secret ? signLinearBody(secret, rawBody) : null;
  return ingestLinearWebhook({
    rawBody,
    signature,
    eventHeader: payload.type,
    timestampHeader: String(now),
    delivery: payload.webhookId ?? randomUUID(),
    userAgent: "Linear-Webhook",
    secret,
    now,
    source: "replay",
  });
}

export function webhookContract() {
  return {
    path: "/api/webhooks/linear",
    method: "POST" as const,
    docs: "https://linear.app/developers/webhooks",
    secretPresent: webhookSecretPresent(),
    resourceTypes: LINEAR_RESOURCE_TYPES,
    retries: LINEAR_WEBHOOK_RETRIES,
    hmac: "HMAC-SHA256 hex of raw body → Linear-Signature",
    freshness: "webhookTimestamp within 60s",
    respond: "HTTP 200 within 5s",
    createMutation: LINEAR_WEBHOOK_CREATE,
    teamId: "bc805575-ad97-4c4a-b316-e42c2ad05ed4",
    projectId: "a6160086-387d-46cd-9611-08686d638a83",
    deliveries: listLinearDeliveries().length,
  };
}
