// End-to-end safety metric: does the record extracted from speech raise an URGENT flag whenever the
// gold-labelled record would (HEARTS rules applied to both)? Counts only; gold text is never printed.
//   node ml/eval_flags.mjs data/gold/transcripts/base_clean.json [--unseen]
import fs from "node:fs";
import { extract } from "../app/web/engine/extractor.js";
import { checkProtocol } from "../app/web/engine/rules.js";
import { goldPairs } from "./eval.mjs";

const schema = JSON.parse(fs.readFileSync("app/web/engine/schema.json", "utf8"));
const lex = JSON.parse(fs.readFileSync("app/web/lexicon/fr.json", "utf8"));
const FU = { "1 week": "P1W", "2 weeks": "P2W", "1 month": "P1M", "3 months": "P3M", "6 months": "P6M" };

function goldValues(l) {
  const [s1, d1] = (l.bp1 || "/").split("/"), [s2, d2] = (l.bp2 || "/").split("/");
  const num = x => (x ? Number(x) : null);
  return { sex: l.sex, age: num(l.age), bp1_sys: num(s1), bp1_dia: num(d1), bp2_sys: num(s2), bp2_dia: num(d2),
    headache: l.headache, chest_pain: l.chest_pain, blurred_vision: l.blurred_vision, breathless: l.breathless,
    on_meds: l.on_meds, missed_doses: l.missed_doses, pregnancy: l.pregnancy, counselling: l.counselling,
    referral: l.referral, follow_up: FU[l.follow_up] ?? "not_mentioned" };
}
const strictUrgent = fl => fl.some(f => f.level === "urgent" && f.code !== "ask_danger_symptoms");

const file = process.argv[2];
let tp = 0, fn = 0, fp = 0, tn = 0, caughtByScreen = 0;
for (const p of goldPairs(file, "speech")) {
  const want = strictUrgent(checkProtocol(goldValues(p.labels)));
  const rec = extract(p.text, schema, lex, { source: "speech" });
  const fl = checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value])));
  const got = strictUrgent(fl);
  if (want && got) tp++; else if (want) { fn++; if (fl.some(f => f.level === "urgent")) caughtByScreen++; }
  else if (got) fp++; else tn++;
}
console.log(`${file.split("/").pop()}${process.argv.includes("--unseen") ? " (unseen 26)" : ""}: urgent cases ${tp + fn}, ` +
  `flagged ${tp} (recall ${(100 * tp / Math.max(1, tp + fn)).toFixed(0)}%), missed ${fn} ` +
  `(of which still shown as urgent "ask danger signs": ${caughtByScreen}), false urgent ${fp} of ${fp + tn} non-urgent`);
