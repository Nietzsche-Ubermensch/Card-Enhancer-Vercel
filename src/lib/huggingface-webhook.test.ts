import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestHfWebhook, notifyLinearFromHf, verifyHfWebhookSecret } from "./huggingface-webhook.ts";

test("HF webhook secret is a shared header, not HMAC", () => {
  assert.equal(verifyHfWebhookSecret("s3cret", "s3cret"), true);
  assert.equal(verifyHfWebhookSecret("s3cret", "other"), false);
  assert.equal(verifyHfWebhookSecret("s3cret", null), false);
});

test("ingest parses repo update payload", () => {
  process.env.HF_WEBHOOK_SECRET = "s3cret";
  const raw = JSON.stringify({
    event: { action: "update", scope: "repo" },
    repo: { name: "hlky/RealESRGAN_x2plus" },
    webhook: { id: "wh-1" },
  });
  const bad = ingestHfWebhook({ rawBody: raw, secretHeader: "nope" });
  assert.equal(bad.ok, false);
  const ok = ingestHfWebhook({ rawBody: raw, secretHeader: "s3cret" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.repo, "hlky/RealESRGAN_x2plus");
    assert.equal(ok.action, "update");
    assert.equal(ok.secret, "verified");
  }
  delete process.env.HF_WEBHOOK_SECRET;
});

test("Linear notify is GraphQL commentCreate, not HMAC hop", async () => {
  const prev = process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_API_TOKEN;
  const r = await notifyLinearFromHf({
    id: "wh-1",
    scope: "repo",
    action: "update",
    repo: "hlky/RealESRGAN_x2plus",
    secret: "unsigned",
  });
  assert.equal(r.ok, false);
  assert.match(r.detail, /LINEAR_API_KEY/);
  if (prev) process.env.LINEAR_API_KEY = prev;
});
