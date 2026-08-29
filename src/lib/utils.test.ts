import assert from "node:assert/strict";
import { test } from "node:test";
import { clamp, cn, slugify } from "./utils.ts";

test("clamp stays inside [min, max]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test("slugify lowercases and strips junk", () => {
  assert.equal(slugify("1952 Topps Mickey!"), "1952_topps_mickey");
  assert.equal(slugify("___"), "card");
});

test("cn merges class names", () => {
  assert.equal(typeof cn("px-2", "px-4"), "string");
  assert.match(cn("px-2", "px-4"), /px-4/);
});
