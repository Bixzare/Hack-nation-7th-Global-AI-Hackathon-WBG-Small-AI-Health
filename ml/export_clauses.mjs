// Builds clause-level classifier data from the SYNTHETIC notes using the browser engine's own
// normalization and clause splitting, so training and inference see identical text.
//   node ml/export_clauses.mjs  -> ml/synth/clauses_{train,dev}.jsonl
import fs from "node:fs";
import { mentions } from "../app/web/engine/extractor.js";

const lex = JSON.parse(fs.readFileSync("app/web/lexicon/fr.json", "utf8"));
for (const split of ["train", "dev"]) {
  const out = [];
  for (const line of fs.readFileSync(`ml/synth/${split}.jsonl`, "utf8").trim().split("\n")) {
    const e = JSON.parse(line);
    for (const m of mentions(e.text, lex)) {
      const label = e.labels[m.symptom];
      if (["present", "absent", "uncertain"].includes(label)) out.push({ ...m, label });
    }
  }
  fs.writeFileSync(`ml/synth/clauses_${split}.jsonl`, out.map(o => JSON.stringify(o)).join("\n") + "\n");
  const by = out.reduce((a, o) => ((a[o.label] = (a[o.label] || 0) + 1), a), {});
  console.log(split, out.length, JSON.stringify(by));
}
