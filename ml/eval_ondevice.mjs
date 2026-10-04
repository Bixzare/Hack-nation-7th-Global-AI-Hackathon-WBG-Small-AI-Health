// On-device ASR evaluation: the SAME Transformers.js model the browser uses, run in Node on the frozen
// gold TEST clips (never used for tuning). Writes data/gold/transcripts/tjs-<model>_test_{clean,noisy}.json
// and prints latency. Score with: node ml/final_report.mjs
//   node ml/eval_ondevice.mjs [whisper-base|whisper-tiny]
import fs from "node:fs";
import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const MODEL = process.argv[2] || "whisper-base";
env.cacheDir = path.join(ROOT, "models/tjs");
const GOLD = path.join(ROOT, "data/gold");
const test = new Set(JSON.parse(fs.readFileSync(path.join(GOLD, "split.json"), "utf8")).test.map(Number));

function readWav16k(file) { // 16 kHz mono PCM16 written by ml/prepare_audio.py
  const b = fs.readFileSync(file);
  let o = 12, data = null;
  while (o < b.length) { const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4); if (id === "data") { data = b.subarray(o + 8, o + 8 + n); break; } o += 8 + n; }
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

const t0 = performance.now();
const asr = await pipeline("automatic-speech-recognition", `onnx-community/${MODEL}`, { dtype: "q8", device: "cpu" });
console.log(`${MODEL} q8 loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const rows = fs.readFileSync(path.join(GOLD, "manifest.csv"), "utf8").trim().split(/\r?\n/).slice(1).map(l => l.split(","));
for (const cond of ["clean", "noisy"]) {
  const out = {}, lat = [];
  let audioS = 0;
  for (const r of rows) {
    const id = Number(r[0]), file = cond === "clean" ? r[3] : r[4];
    if (!test.has(id) || !file) continue;
    const audio = readWav16k(path.join(GOLD, file));
    const t = performance.now();
    const res = await asr(audio, { language: "french", task: "transcribe", chunk_length_s: 30 });
    lat.push((performance.now() - t) / 1000); audioS += audio.length / 16000;
    out[String(id)] = res.text.trim();
  }
  fs.writeFileSync(path.join(GOLD, `transcripts/tjs-${MODEL}_test_${cond}.json`), JSON.stringify(out, null, 1));
  lat.sort((a, b) => a - b);
  console.log(`${MODEL} ${cond}: ${lat.length} clips, median ${lat[lat.length >> 1].toFixed(2)} s, RTF ${(lat.reduce((a, b) => a + b, 0) / audioS).toFixed(2)}`);
}
