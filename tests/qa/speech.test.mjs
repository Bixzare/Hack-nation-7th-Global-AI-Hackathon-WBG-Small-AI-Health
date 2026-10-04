// QA with YOUR OWN VOICE (local-only): record the demo phrases (docs/QA-phrases.md) as
// data/qa/audio/<id>.wav|m4a|mp3|webm|ogg, start the speech service, then: npm run test:qa
// Each recording goes through the local Whisper service (same path as live dictation) and the extractor.
// Hard safety checks always apply; exact values are reported per phrase (speech can mishear: numbers are
// always "please check", that is the design).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { extract } from "../../app/web/engine/extractor.js";
import { checkProtocol } from "../../app/web/engine/rules.js";
import { ROOT, IN_CI } from "../helpers/server.mjs";

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");
const TH = read("app/web/profiles/fr-dje.json").asr_low_conf_threshold ?? 0.4;
const { phrases } = read("tests/qa/demo_phrases.json");
const DIR = path.join(ROOT, "data/qa/audio");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];
const recorded = phrases.filter(p => !p.todo).map(p => ({ ...p, file: files.find(f => f.replace(/\.[^.]+$/, "") === p.id) })).filter(p => p.file);
let up = false;
if (!IN_CI) try { up = (await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(1500) })).ok; } catch {}
const URGENT = fl => fl.some(f => f.level === "urgent" && f.code !== "ask_danger_symptoms");
const DANGER = ["headache", "chest_pain", "blurred_vision", "breathless"];

describe("QA speech: your recordings -> local Whisper -> record (local-only)", {
  skip: (IN_CI && "local-only") || (!recorded.length && `no recordings in data/qa/audio/ (see docs/QA-phrases.md)`) || (!up && "speech service not running"),
}, () => {
  for (const ph of recorded) {
    describe(`${ph.id} (${ph.file})`, () => {
      let j, rec;
      test("transcribed (not empty, not 'too quiet')", async () => {
        const r = await fetch("http://127.0.0.1:8765/transcribe", { method: "POST", body: fs.readFileSync(path.join(DIR, ph.file)) });
        j = await r.json();
        console.log(`   ${ph.id} raw: «${j.text}»  (${j.proc_s}s, mean ${j.mean_db} dB${j.normalised ? ", normalised" : ""})`);
        assert.ok(j.text?.length > 3, "empty transcript");
        rec = extract(j.text, schema, lex, { source: "speech", lowConf: (j.words || []).filter(w => w.p < TH).map(w => w.w) });
      });
      test("SAFETY: every number from speech is 'please check'", () => {
        for (const k of ["age", "bp1_sys", "bp1_dia", "bp2_sys", "bp2_dia"]) if (rec[k].value != null) assert.equal(rec[k].check, true, k);
      });
      test("SAFETY: no danger symptom that should be present is marked absent", () => {
        for (const s of DANGER) if (ph.expect[s] === "present") assert.notEqual(rec[s].value, "absent", s);
      });
      test("SAFETY: urgent phrases raise an URGENT flag (or the urgent field is 'please check')", () => {
        if (!(ph.flags || []).some(c => c.startsWith("urgent"))) return;
        const fl = checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value])));
        assert.ok(URGENT(fl) || ["bp1_sys", ...DANGER].some(k => rec[k].check), "urgent case lost without a flag");
      });
      test("values match the phrase (report)", () => {
        const wrong = Object.entries(ph.expect).filter(([k, v]) => rec[k].value !== v)
          .map(([k, v]) => `${k}: want ${v}, got ${rec[k].value}${rec[k].check ? " (flagged)" : " (SILENT)"}`);
        assert.deepEqual(wrong, [], wrong.join("; "));
      });
    });
  }
});
