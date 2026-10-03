// Field-accuracy evaluation of the browser extractor (same JS, run in Node).
//
//   node ml/eval.mjs dev                       synthetic dev set (ml/synth/dev.jsonl)
//   node ml/eval.mjs gold <transcripts.json>   gold labels vs a transcript file (speech or typed)
//   add --clf to use the exported classifier (app/web/models/symptom_clf.json)
//
// Gold texts are never printed: only per-field accuracy and error counts by field.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "../app/web/engine/extractor.js";
import { loadClassifier } from "../app/web/engine/classifier.js";
import { checkProtocol } from "../app/web/engine/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");

export const FIELDS = ["sex", "age", "bp1", "bp2", "headache", "chest_pain", "blurred_vision", "breathless",
  "on_meds", "missed_doses", "pregnancy", "counselling", "follow_up", "referral"];
const FU = { "3 days": "P3D", "1 week": "P1W", "2 weeks": "P2W", "3 weeks": "P3W", "1 month": "P1M",
  "2 months": "P2M", "3 months": "P3M", "6 months": "P6M", "not_mentioned": "not_mentioned" };

// record -> label-convention values
export function toLabels(rec) {
  const v = k => rec[k]?.value;
  const bp = n => (v(`bp${n}_sys`) != null && v(`bp${n}_dia`) != null) ? `${v(`bp${n}_sys`)}/${v(`bp${n}_dia`)}` : "";
  const fuInv = Object.fromEntries(Object.entries(FU).map(([a, b]) => [b, a]));
  return {
    sex: v("sex"), age: v("age") == null ? "" : String(v("age")), bp1: bp(1), bp2: bp(2),
    headache: v("headache"), chest_pain: v("chest_pain"), blurred_vision: v("blurred_vision"),
    breathless: v("breathless"), on_meds: v("on_meds"), missed_doses: v("missed_doses"),
    pregnancy: v("pregnancy"), counselling: v("counselling"), referral: v("referral"),
    follow_up: fuInv[v("follow_up")] ?? v("follow_up"),
  };
}

export function score(pairs, opts) {
  const per = Object.fromEntries(FIELDS.map(f => [f, { ok: 0, n: 0, conf: {} }]));
  let checks = 0, uncertainSurfaced = 0, uncertainTotal = 0, uncertainByFlag = 0;
  for (const { text, labels, source } of pairs) {
    const rec = extract(text, schema, lex, { ...opts, source });
    const got = toLabels(rec);
    for (const f of FIELDS) {
      const want = String(labels[f] ?? "");
      const ok = String(got[f] ?? "") === want;
      per[f].n++; if (ok) per[f].ok++;
      else { const k = `${want}->${got[f]}`; per[f].conf[k] = (per[f].conf[k] || 0) + 1; }
      if (want === "uncertain") {
        uncertainTotal++;
        const vals = Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value]));
        const flagged = checkProtocol(vals).some(fl => ["ask_danger_symptoms", "symptom_uncertain", "urgent_if_symptoms_confirmed"].includes(fl.code));
        if (rec[f]?.check) uncertainSurfaced++; else if (flagged && got[f] !== "absent") uncertainByFlag++;
      }
    }
    checks += Object.values(rec).filter(x => x.check).length;
  }
  const total = FIELDS.reduce((a, f) => a + per[f].ok, 0) / FIELDS.reduce((a, f) => a + per[f].n, 0);
  return { per, total, checksPerNote: checks / pairs.length, uncertainSurfaced, uncertainTotal, uncertainByFlag };
}

export function report(name, r, showConfusions = true) {
  console.log(`\n== ${name}: overall field accuracy ${(100 * r.total).toFixed(1)}%  ` +
    `("please check" per note ${r.checksPerNote.toFixed(1)}; uncertain surfaced: field ${r.uncertainSurfaced} + flag ${r.uncertainByFlag} of ${r.uncertainTotal})`);
  for (const f of FIELDS) {
    const p = r.per[f];
    const errs = showConfusions ? Object.entries(p.conf).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(", ") : "";
    console.log(`  ${f.padEnd(15)} ${(100 * p.ok / p.n).toFixed(0).padStart(4)}%  ${errs}`);
  }
}

function csvRows(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map(l => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

export function goldPairs(transcriptFile, source) {
  const labels = csvRows(path.join(ROOT, "data/gold/gold_labels.csv"));
  const tx = JSON.parse(fs.readFileSync(transcriptFile, "utf8"));
  // Gold clips whose transcript wording the developer has seen (hosted-demo samples, 3 Oct ~22:35):
  // reported separately so the "unseen" numbers stay clean.
  const exclude = process.argv.includes("--unseen") ? new Set(["1", "4", "13", "20"]) : new Set();
  return labels.filter(l => tx[l.id] != null && !exclude.has(l.id)).map(l => ({ text: tx[l.id], labels: l, source }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const useClf = process.argv.includes("--clf");
  const opts = useClf ? { classifier: loadClassifier(read("app/web/models/symptom_clf.json")) } : {};
  if (mode === "devnoisy") { // dev notes with simulated ASR spelling errors (1 edit in ~1/4 of long words)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const corrupt = t => t.replace(/[a-zéèêàç]{6,}/gi, w => {
      if (rnd() > 0.25) return w;
      const i = 1 + Math.floor(rnd() * (w.length - 1)), op = rnd();
      return op < 0.33 ? w.slice(0, i) + w.slice(i + 1) : op < 0.66 ? w.slice(0, i) + "e" + w.slice(i) : w.slice(0, i) + "a" + w.slice(i + 1);
    });
    const pairs = fs.readFileSync(path.join(ROOT, "ml/synth/dev.jsonl"), "utf8").trim().split("\n")
      .map(l => JSON.parse(l)).map(e => ({ text: corrupt(e.text), labels: e.labels, source: "typed" }));
    report(`dev+ASR-typos (synthetic)${useClf ? " rules+clf" : " rules"}`, score(pairs, opts));
  } else if (mode === "dev") {
    const pairs = fs.readFileSync(path.join(ROOT, "ml/synth/dev.jsonl"), "utf8").trim().split("\n")
      .map(l => JSON.parse(l)).map(e => ({ text: e.text, labels: e.labels, source: "typed" }));
    report(`dev (synthetic)${useClf ? " rules+clf" : " rules"}`, score(pairs, opts));
  } else {
    report(`gold${process.argv.includes("--unseen") ? "-26 unseen" : "-30"} ${path.basename(file)}${useClf ? " rules+clf" : " rules"}`,
      score(goldPairs(file, file.includes("typed") ? "typed" : "speech"), opts), false);
  }
}
