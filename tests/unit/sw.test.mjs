// Service-worker cache hygiene: an update must delete only the app's own old shell caches, never other
// caches such as the on-device speech model cache (79 MB; wiping it would break offline dictation).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/web/sw.js"), "utf8");
const CACHE = /const CACHE = "([^"]+)"/.exec(src)[1];
const line = /const isOldAppCache = (.+);/.exec(src)[1];
const filter = new Function("CACHE", `return ${line};`)(CACHE);

test("old app caches are deleted on update", () => {
  for (const k of ["htn-v15", "htn-v16", "movois-v3"]) assert.equal(filter(k), true, k);
});
test("current cache and the speech-model cache are kept", () => {
  for (const k of [CACHE, "transformers-cache", "onnx-models", "anything-else"]) assert.equal(filter(k), false, k);
});
