// Final numbers on the frozen gold TEST split (20 clips). Counts and %, per condition and per voice.
//   node ml/final_report.mjs > docs/results-test.md
import fs from "node:fs";
import path from "node:path";
import { extract } from "../app/web/engine/extractor.js";
import { checkProtocol } from "../app/web/engine/rules.js";
import { FIELDS, toLabels, goldPairs } from "./eval.mjs";
import { flagAllSpeechFields } from "../app/web/engine/asrmode.js";

const schema = JSON.parse(fs.readFileSync("app/web/engine/schema.json", "utf8"));
const lex = JSON.parse(fs.readFileSync("app/web/lexicon/fr.json", "utf8"));
const test = new Set(JSON.parse(fs.readFileSync("data/gold/split.json", "utf8")).test.map(String));
const voice = id => (Number(id) <= 10 ? "A" : Number(id) <= 20 ? "B" : "C");
const DANGER = ["headache", "chest_pain", "blurred_vision", "breathless"];
const FU = { "1 week": "P1W", "2 weeks": "P2W", "1 month": "P1M", "3 months": "P3M", "6 months": "P6M" };
const num = x => (x ? Number(x) : null);
const goldValues = l => {
  const [s1, d1] = (l.bp1 || "/").split("/"), [s2, d2] = (l.bp2 || "/").split("/");
  return { ...l, age: num(l.age), bp1_sys: num(s1), bp1_dia: num(d1), bp2_sys: num(s2), bp2_dia: num(d2),
    follow_up: FU[l.follow_up] ?? "not_mentioned" };
};
const urgent = fl => fl.some(f => f.level === "urgent" && f.code !== "ask_danger_symptoms");
const pct = (a, b) => (b ? `${a}/${b} (${(100 * a / b).toFixed(1)}%)` : "n/a");

const TH = JSON.parse(fs.readFileSync("app/web/profiles/fr-dje.json", "utf8")).asr_low_conf_threshold ?? 0.4;
const MAPF = { bp1: ["bp1_sys", "bp1_dia"], bp2: ["bp2_sys", "bp2_dia"] };
function run(file) {
  const src = file.endsWith("typed.json") ? "typed" : "speech";
  let words = {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Object.values(raw)[0]?.words) { // word-level file: {id: {text, words}}
    words = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.words]));
    file = file.replace(/\.json$/, ".txt.json");
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.text]))));
  }
  const rows = goldPairs(file, src).filter(p => test.has(p.labels.id));
  const agg = { ok: 0, n: 0, byVoice: {}, head: [0, 0], falseAbsent: 0, present: 0, urg: [0, 0], falseUrg: [0, 0], silent: 0 };
  for (const p of rows) {
    const lowConf = (words[p.labels.id] || []).filter(w => w.p < TH).map(w => w.w);
    const rec = extract(p.text, schema, lex, { source: src, lowConf });
    if (path.basename(file).startsWith("tjs-")) flagAllSpeechFields(rec, schema); // on-device rule
    const got = toLabels(rec);
    const v = voice(p.labels.id);
    agg.byVoice[v] ??= [0, 0];
    for (const f of FIELDS) {
      const ok = String(got[f] ?? "") === String(p.labels[f] ?? "");
      agg.ok += ok; agg.n++; agg.byVoice[v][0] += ok; agg.byVoice[v][1]++;
      if (!ok && !(MAPF[f] || [f]).some(k => rec[k]?.check)) agg.silent++; // wrong AND not "please check"
    }
    if (p.labels.headache !== "not_mentioned") { agg.head[1]++; agg.head[0] += got.headache === p.labels.headache; }
    for (const s of DANGER) if (p.labels[s] === "present") { agg.present++; if (got[s] === "absent") agg.falseAbsent++; }
    const want = urgent(checkProtocol(goldValues(p.labels)));
    const have = urgent(checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value]))));
    if (want) { agg.urg[1]++; agg.urg[0] += have; } else { agg.falseUrg[1]++; agg.falseUrg[0] += have; }
  }
  return { clips: rows.length, ...agg };
}

console.log("| Condition | Clips | Field accuracy | Voice A | Voice B | Voice C | Headache (mentioned) | Urgent caught | False urgent | Present danger symptom marked absent | Wrong fields NOT flagged |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [name, f] of [["Typed (script text)", "typed"], ["Whisper small, clean", "small_clean"], ["Whisper small, noisy", "small_noisy"],
                         ["Whisper small, LIVE config (webm, VAD on), clean", "small-live_clean"], ["Whisper small, LIVE config, noisy", "small-live_noisy"],
                         ["Whisper small, LIVE + word confidence + corrections + adherence classes (v7), clean", "small-words_test_clean"],
                         ["Whisper small, LIVE + word confidence + corrections + adherence classes (v7), noisy", "small-words_test_noisy"],
                         ["ON-DEVICE whisper-base q8 (Transformers.js), clean", "tjs-whisper-base_test_clean"], ["ON-DEVICE whisper-base q8 (Transformers.js), noisy", "tjs-whisper-base_test_noisy"],
                         ["Whisper base, clean", "base_clean"], ["Whisper base, noisy", "base_noisy"], ["Whisper tiny, clean", "tiny_clean"]]) {
  if (!fs.existsSync(`data/gold/transcripts/${f}.json`)) continue;
  const r = run(`data/gold/transcripts/${f}.json`);
  const bv = k => (r.byVoice[k] ? pct(...r.byVoice[k]) : "n/a");
  console.log(`| ${name} | ${r.clips} | ${pct(r.ok, r.n)} | ${bv("A")} | ${bv("B")} | ${bv("C")} | ${pct(...r.head)} | ${pct(...r.urg)} | ${pct(...r.falseUrg)} | ${r.falseAbsent} of ${r.present} | ${r.silent} |`);
}
