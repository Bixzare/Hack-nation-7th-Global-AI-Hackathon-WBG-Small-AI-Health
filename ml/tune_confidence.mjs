// Tune the ASR word-confidence threshold on gold DEV clips only.
//   node ml/tune_confidence.mjs [dev|test] [tag]   (reads data/gold/transcripts/<tag>_<split>_{clean,noisy}.json)
// For each threshold: wrong fields that become "please check" thanks to low-confidence words (caught),
// wrong fields still silently wrong, and extra flags on CORRECT fields per note (burden).
import fs from "node:fs";
import { extract } from "../app/web/engine/extractor.js";
import { FIELDS, toLabels, goldPairs } from "./eval.mjs";

const split = process.argv[2] || "dev", tag = process.argv[3] || "small-words";
const schema = JSON.parse(fs.readFileSync("app/web/engine/schema.json", "utf8"));
const lex = JSON.parse(fs.readFileSync("app/web/lexicon/fr.json", "utf8"));
const MAP = { sex: ["sex"], age: ["age"], bp1: ["bp1_sys", "bp1_dia"], bp2: ["bp2_sys", "bp2_dia"] };
const rows = [];
for (const cond of ["clean", "noisy"]) {
  const f = `data/gold/transcripts/${tag}_${split}_${cond}.json`;
  if (!fs.existsSync(f)) continue;
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const tx = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.text]));
  fs.writeFileSync("/tmp/_tx.json", JSON.stringify(tx));
  for (const p of goldPairs("/tmp/_tx.json", "speech")) rows.push({ ...p, words: data[p.labels.id].words, cond });
}
console.log(`${split}: ${rows.length} clips`);
for (const th of [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
  let wrong = 0, silentWrong = 0, caught = 0, extra = 0;
  for (const r of rows) {
    const low = r.words.filter(w => w.p < th).map(w => w.w);
    const base = extract(r.text, schema, lex, { source: "speech" });
    const rec = extract(r.text, schema, lex, { source: "speech", lowConf: low });
    const got = toLabels(rec);
    for (const f of FIELDS) {
      const keys = MAP[f] || [f];
      const ok = String(got[f] ?? "") === String(r.labels[f] ?? "");
      const flagged = keys.some(k => rec[k]?.check), flaggedBefore = keys.some(k => base[k]?.check);
      if (!ok) { wrong++; if (!flagged) silentWrong++; if (flagged && !flaggedBefore) caught++; }
      else if (flagged && !flaggedBefore) extra++;
    }
  }
  console.log(`threshold ${th.toFixed(1)}: wrong ${wrong}, silently wrong ${silentWrong}, newly caught ${caught}, extra flags on correct fields ${extra} (${(extra / rows.length).toFixed(2)}/note)`);
}
