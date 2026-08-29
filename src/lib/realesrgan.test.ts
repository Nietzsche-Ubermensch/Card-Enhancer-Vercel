import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDataUrl, realesrganContract, runRealEsrgan } from "./realesrgan.ts";

test("contract names the Hub ×2 recipe", () => {
  const c = realesrganContract();
  assert.equal(c.model, "hlky/RealESRGAN_x2plus");
  assert.equal(c.scale, 2);
  assert.equal(c.path, "/api/upscale");
});

test("rejects non-data URLs", () => {
  assert.equal(parseDataUrl("https://example.com/a.jpg"), null);
  assert.equal(parseDataUrl("data:text/plain;base64,YQ=="), null);
});

test("parses jpeg data URL", () => {
  const raw = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0]).toString("base64");
  const d = parseDataUrl(`data:image/jpeg;base64,${raw}`);
  assert.ok(d);
  assert.equal(d?.mime, "image/jpeg");
});

test("runRealEsrgan without token is 503", async () => {
  const prev = process.env.HF_TOKEN;
  delete process.env.HF_TOKEN;
  delete process.env.HUGGINGFACE_API_KEY;
  delete process.env.HUGGINGFACE_TOKEN;
  const r = await runRealEsrgan("data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 503);
    assert.match(r.error, /HF_TOKEN/);
  }
  if (prev) process.env.HF_TOKEN = prev;
});
