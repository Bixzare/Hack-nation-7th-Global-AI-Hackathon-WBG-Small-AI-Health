// On-device speech recognition (beta): Whisper via Transformers.js (vendored, pinned 4.3.0), in a Web Worker
// so the UI never freezes. Model files download once from the Hugging Face hub and are kept in the browser's
// Cache API (Transformers.js browser cache), so later use works offline. French, transcribe only.
import { pipeline, env } from "../vendor/transformers.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("../vendor/", import.meta.url).href; // same-origin runtime, no CDN
if (!self.crossOriginIsolated) env.backends.onnx.wasm.numThreads = 1; // GitHub Pages has no COOP/COEP

let asr = null, device = "wasm";

async function load(model) {
  const progress = p => postMessage({ type: "progress", ...p });
  const tryLoad = dev => pipeline("automatic-speech-recognition", model, { dtype: "q8", device: dev, progress_callback: progress });
  if (!asr) {
    let gpu = false;
    try { gpu = !!(self.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch {}
    if (gpu) { try { asr = await tryLoad("webgpu"); device = "webgpu"; } catch { asr = null; } }
    if (!asr) { asr = await tryLoad("wasm"); device = "wasm"; }
  }
  postMessage({ type: "ready", device });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") await load(data.model);
    if (data.type === "transcribe") {
      if (!asr) await load(data.model);
      const t = performance.now();
      const out = await asr(data.audio, { language: "french", task: "transcribe", chunk_length_s: 30 });
      postMessage({ type: "result", text: (out.text || "").trim(), proc_s: +((performance.now() - t) / 1000).toFixed(1), device });
    }
  } catch (e) {
    postMessage({ type: "error", message: String(e?.message || e) });
  }
};
