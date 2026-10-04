// Copies the pinned on-device speech runtime into app/web/vendor/ (served same-origin; no CDN at runtime).
// Not committed: the minified library trips GitHub's secret scanner (false positive on model-name tables).
// Run after `npm ci`:  npm run vendor
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const OUT = path.join(ROOT, "app/web/vendor");
const nm = p => path.join(ROOT, "node_modules", p);
fs.mkdirSync(OUT, { recursive: true });
for (const [src, dst] of [
  ["@huggingface/transformers/dist/transformers.min.js", "transformers.min.js"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.wasm"],
  ["@huggingface/transformers/LICENSE", "LICENSE-transformers.txt"],
]) {
  fs.copyFileSync(nm(src), path.join(OUT, dst));
  console.log(`vendor/${dst}  ${(fs.statSync(path.join(OUT, dst)).size / 1e6).toFixed(2)} MB`);
}
