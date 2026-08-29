import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearLinearDeliveries,
  ingestLinearWebhook,
  linearWebhookPayloadSchema,
  listLinearDeliveries,
  replayLinearSample,
  sampleLinearPayload,
  signLinearBody,
  timestampFresh,
  verifyLinearSignature,
} from "./linear-webhook.ts";

const SECRET = "test-linear-webhook-secret";

test("HMAC-SHA256 Linear-Signature matches raw body", () => {
  const body = '{"action":"update","type":"Issue"}';
  const sig = signLinearBody(SECRET, body);
  assert.equal(sig.length, 64);
  assert.equal(verifyLinearSignature(SECRET, sig, body), true);
  assert.equal(verifyLinearSignature(SECRET, sig, body + " "), false);
  assert.equal(verifyLinearSignature(SECRET, "zzzz", body), false);
  assert.equal(verifyLinearSignature(SECRET, null, body), false);
});

test("webhookTimestamp must be within 60 seconds", () => {
  const now = 1_700_000_000_000;
  assert.equal(timestampFresh(now, now), true);
  assert.equal(timestampFresh(now - 59_000, now), true);
  assert.equal(timestampFresh(now - 61_000, now), false);
  assert.equal(timestampFresh(undefined, now), false);
});

test("Issue update payload with updatedFrom parses", () => {
  const now = Date.now();
  const payload = sampleLinearPayload("issue.update", now);
  const parsed = linearWebhookPayloadSchema.parse(payload);
  assert.equal(parsed.action, "update");
  assert.equal(parsed.type, "Issue");
  assert.ok(parsed.updatedFrom && "stateId" in parsed.updatedFrom);
});

test("signed ingest accepts a fresh Issue update and rejects a bad signature", () => {
  clearLinearDeliveries();
  const now = Date.now();
  const payload = sampleLinearPayload("issue.update", now);
  const rawBody = JSON.stringify(payload);
  const signature = signLinearBody(SECRET, rawBody);
  const ok = ingestLinearWebhook({
    rawBody,
    signature,
    eventHeader: "Issue",
    timestampHeader: String(now),
    delivery: payload.webhookId ?? "d1",
    userAgent: "Linear-Webhook",
    secret: SECRET,
    now,
    source: "linear",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.event.signature, "verified");
    assert.equal(ok.event.identifier, "JUG-15");
    assert.equal(ok.event.action, "update");
    assert.deepEqual(ok.event.changed, ["stateId", "completedAt"]);
  }

  const bad = ingestLinearWebhook({
    rawBody,
    signature: signLinearBody(SECRET, "{}"),
    eventHeader: "Issue",
    timestampHeader: String(now),
    delivery: "d2",
    userAgent: "Linear-Webhook",
    secret: SECRET,
    now,
    source: "linear",
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.status, 401);
});

test("signed ingest rejects a stale timestamp", () => {
  const now = Date.now();
  const payload = sampleLinearPayload("comment.create", now - 120_000);
  const rawBody = JSON.stringify(payload);
  const result = ingestLinearWebhook({
    rawBody,
    signature: signLinearBody(SECRET, rawBody),
    eventHeader: "Comment",
    timestampHeader: String(now - 120_000),
    delivery: "stale-1",
    userAgent: "Linear-Webhook",
    secret: SECRET,
    now,
    source: "linear",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "stale webhookTimestamp");
});

test("replay samples land in the inbox through the same parser", () => {
  clearLinearDeliveries();
  const a = replayLinearSample("issue.update", SECRET);
  const b = replayLinearSample("comment.create", SECRET);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const list = listLinearDeliveries();
  assert.equal(list.length, 2);
  assert.equal(list[0].type, "Comment");
  assert.equal(list[1].type, "Issue");
  assert.equal(list.every((e) => e.signature === "verified"), true);
});
