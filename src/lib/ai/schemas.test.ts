import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeBodySchema,
  chatBodySchema,
  generateBodySchema,
  githubQuerySchema,
  jsonlEntrySchema,
  modelSearchSchema,
  rrdbNetConfigSchema,
} from "./schemas.ts";
import { GIT_PIPELINE, HF_RRDBNET_CONFIG } from "../sports-card.ts";

test("chat schema accepts a short prompt", () => {
  const parsed = chatBodySchema.parse({ prompt: "ping" });
  assert.equal(parsed.prompt, "ping");
  assert.deepEqual(parsed.messages, []);
});

test("chat schema rejects an empty prompt", () => {
  assert.throws(() => chatBodySchema.parse({ prompt: "   " }));
});

test("generate schema requires 1K or 2K", () => {
  assert.equal(generateBodySchema.parse({ prompt: "chrome rookie", size: "1K" }).size, "1K");
  assert.throws(() => generateBodySchema.parse({ prompt: "x", size: "4K" }));
});

test("analyze schema requires an image mime", () => {
  assert.throws(() => analyzeBodySchema.parse({ imageBase64: "abc", mimeType: "text/plain" }));
  assert.equal(analyzeBodySchema.parse({ imageBase64: "abc", mimeType: "image/jpeg" }).mimeType, "image/jpeg");
});

test("model search clamps limit and defaults query", () => {
  assert.throws(() => modelSearchSchema.parse({ query: "Real-ESRGAN", limit: 99 }));
  assert.equal(modelSearchSchema.parse({ query: "Real-ESRGAN", limit: 8 }).limit, 8);
  assert.equal(modelSearchSchema.parse({}).query, "Real-ESRGAN");
  assert.equal(modelSearchSchema.parse({ limit: "4" }).limit, 4);
});

test("github query defaults to the GitMCP pipeline repo", () => {
  const parsed = githubQuerySchema.parse({});
  assert.equal(parsed.owner, GIT_PIPELINE.owner);
  assert.equal(parsed.repo, GIT_PIPELINE.repo);
  assert.throws(() => githubQuerySchema.parse({ owner: "../etc", repo: "x" }));
});

test("RRDBNet config matches Hugging Face recipe", () => {
  const parsed = rrdbNetConfigSchema.parse({
    _class_name: "RRDBNet",
    _diffusers_version: "0.37.0.dev0",
    num_block: 23,
    num_feat: 64,
    num_grow_ch: 32,
    num_in_ch: 3,
    num_out_ch: 3,
    scale: 2,
  });
  assert.equal(parsed._class_name, HF_RRDBNET_CONFIG._class_name);
  assert.equal(parsed.scale, 2);
  assert.equal(parsed.num_block, 23);
  assert.throws(() => rrdbNetConfigSchema.parse({ ...parsed, _class_name: "UNet" }));
});

test("JSONL resume log matches gigapixel/batch.py process_single", () => {
  const parsed = jsonlEntrySchema.parse({
    input: "/cards/rookie.jpg",
    output: "/out/rookie_enhanced.jpg",
    success: true,
    error: null,
  });
  assert.equal(parsed.success, true);
  assert.equal(GIT_PIPELINE.resumeFlag, "--resume");
  assert.equal(GIT_PIPELINE.resumeFn, "process_directory_resume");
  assert.equal(GIT_PIPELINE.loadFn, "load_completed_inputs");
  assert.throws(() => jsonlEntrySchema.parse({ input: "", output: "x", success: true }));
});
