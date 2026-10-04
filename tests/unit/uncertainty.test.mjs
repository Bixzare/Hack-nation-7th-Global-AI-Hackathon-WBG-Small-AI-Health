// Close-match vocabulary correction and ASR word-confidence flags.
// Rule under test: a corrected or low-confidence word may PRE-FILL a field but never fills it silently.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract, normalize } from "../../app/web/engine/extractor.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");
const ex = (t, o = {}) => extract(t, schema, lex, { source: "speech", ...o });

describe("close-match correction pre-fills AND flags", () => {
  test('"FAM 35 ans" -> Femme / 35, sex flagged as corrected', () => {
    const r = ex("FAM 35 ans");
    assert.equal(r.sex.value, "F"); assert.equal(r.sex.check, true); assert.equal(r.sex.reason, "corrected");
    assert.equal(r.age.value, 35);
  });
  test(`"c'est fallé depuis 3 jours" -> headache present, flagged (sound-alike)`, () => {
    const r = ex("c'est fallé depuis 3 jours");
    assert.equal(r.headache.value, "present"); assert.equal(r.headache.check, true);
  });
  test('"pas de s\'effaler" -> headache absent, flagged (corrected)', () => {
    const r = ex("Homme 41 ans, pas de s'effaler");
    assert.equal(r.headache.value, "absent"); assert.equal(r.headache.check, true);
  });
  test('"dispnée" -> breathless present, flagged', () => {
    const r = ex("Femme 60 ans, dispnée depuis hier");
    assert.equal(r.breathless.value, "present"); assert.equal(r.breathless.check, true);
  });
  test("correct spelling is NOT flagged as corrected", () => {
    const r = extract("Femme 35 ans, céphalées", schema, lex, { source: "typed" });
    assert.equal(r.sex.check, false); assert.equal(r.headache.check, false);
  });
});

describe("negative cases: everyday words that look similar must NOT match", () => {
  for (const [t, field, notValue] of [
    ["il travaille à la ferme", "sex", "F"], ["elle a faim", "headache", "present"], ["sa famille va bien", "sex", "F"],
    ["une pomme", "sex", "M"], ["comme hier", "sex", "M"], ["il fallait venir", "headache", "present"],
    ["cela fait trois jours", "headache", "present"], ["un ensemble de signes", "pregnancy", "pregnant"],
  ]) {
    test(`"${t}" does not set ${field}=${notValue} via correction`, () => {
      const r = ex(t);
      if (r[field].value === notValue) assert.notEqual(r[field].reason, "corrected");
    });
  }
  test("protected words are left unchanged by normalization", () => {
    assert.equal(normalize("ferme faim famille pomme comme", lex), "ferme faim famille pomme comme");
  });
});

describe("ASR word confidence", () => {
  test("a low-confidence symptom word flags that symptom only", () => {
    const r = ex("Femme 45 ans, céphalées, pas de douleur thoracique", { lowConf: ["céphalées"] });
    assert.equal(r.headache.value, "present"); assert.equal(r.headache.check, true);
    assert.equal(r.headache.reason, "low_asr_confidence");
    assert.equal(r.chest_pain.check, false);
  });
  test("a low-confidence negation word flags the negated symptom", () => {
    const r = ex("Homme 50 ans, pas de dyspnée", { lowConf: ["pas"] });
    assert.equal(r.breathless.value, "absent"); assert.equal(r.breathless.check, true);
  });
  test("a low-confidence sex word flags sex", () => {
    const r = ex("Femme 45 ans", { lowConf: ["Femme"] });
    assert.equal(r.sex.check, true);
  });
  test("no low-confidence words -> no extra flags on text fields", () => {
    const r = ex("Femme 45 ans, céphalées", { lowConf: [] });
    assert.equal(r.sex.check, false); assert.equal(r.headache.check, false);
  });
});
