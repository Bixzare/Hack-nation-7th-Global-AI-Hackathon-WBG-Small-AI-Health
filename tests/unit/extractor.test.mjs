// Extractor unit tests: adversarial fixtures (dev/unit set) + regression guards on the 30 typed gold texts.
// Gold guards never drive tuning on test clips; they only stop silent regressions.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract, normalize } from "../../app/web/engine/extractor.js";
import { checkProtocol } from "../../app/web/engine/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");
const { cases } = read("tests/fixtures/unit_cases.json");

describe("number normalization", () => {
  for (const [words, digits] of [["cent soixante-deux sur quatre-vingt-dix-huit", "162 sur 98"], ["trente-cinq ans", "35 ans"],
    ["soixante-et-onze", "71"], ["deux cents", "200"], ["quatre vingt douze", "92"], ["cent dix", "110"]]) {
    test(`"${words}" -> "${digits}"`, () => assert.equal(normalize(words, lex), digits));
  }
});

describe("adversarial unit cases (typed)", () => {
  for (const c of cases) {
    test(c.name, () => {
      const rec = extract(c.text, schema, lex, { source: "typed" });
      for (const [k, v] of Object.entries(c.expect)) assert.equal(rec[k].value, v, `${k}`);
      for (const k of c.check || []) assert.equal(rec[k].check, true, `${k} should be "please check"`);
    });
  }
});

describe("speech safety", () => {
  test("numbers from speech are always 'please check'", () => {
    const rec = extract("Femme 45 ans, TA 150/95", schema, lex, { source: "speech" });
    for (const k of ["age", "bp1_sys", "bp1_dia"]) assert.equal(rec[k].check, true, k);
  });
  test("extraction never throws on odd input", () => {
    for (const s of ["", "   ", "???", "123/", "/ / /", "a".repeat(5000), "TA 999/999"]) extract(s, schema, lex, {});
  });
});

// ---- regression guards on the typed gold texts (skipped on a fresh clone: data/ is gitignored) ----
const typedPath = path.join(ROOT, "data/gold/transcripts/typed.json");
const labelsPath = path.join(ROOT, "data/gold/gold_labels.csv");
const haveGold = fs.existsSync(typedPath) && fs.existsSync(labelsPath);

describe("gold typed texts (30): regression guards", { skip: !haveGold && "gold data not present" }, () => {
  if (!haveGold) return;
  const typed = JSON.parse(fs.readFileSync(typedPath, "utf8"));
  const [head, ...lines] = fs.readFileSync(labelsPath, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const labels = lines.map(l => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  const D = ["headache", "chest_pain", "blurred_vision", "breathless"];
  const num = x => (x ? Number(x) : null);

  for (const l of labels) {
    test(`gold ${l.id}: BP exact, no present danger sign marked absent, urgent flag agrees`, () => {
      const rec = extract(typed[l.id], schema, lex, { source: "typed" });
      const [s1, d1] = (l.bp1 || "/").split("/");
      assert.equal(rec.bp1_sys.value, num(s1), "bp1_sys"); assert.equal(rec.bp1_dia.value, num(d1), "bp1_dia");
      for (const s of D) if (l[s] === "present") assert.notEqual(rec[s].value, "absent", `${s} present marked absent`);
      const gv = { ...l, age: num(l.age), bp1_sys: num(s1), bp1_dia: num(d1), bp2_sys: num((l.bp2 || "/").split("/")[0]), bp2_dia: num((l.bp2 || "/").split("/")[1]) };
      const urgent = fl => fl.some(f => f.level === "urgent" && f.code !== "ask_danger_symptoms");
      const got = urgent(checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value]))));
      assert.equal(got, urgent(checkProtocol(gv)), "urgent flag");
    });
  }
});
