// Adherence vocabulary as classes (lexicon v7): good -> on_meds yes / missed_doses no; partial (rarely,
// sometimes) -> sometimes; often / poor -> yes. Plus must-not-match cases.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "../../app/web/engine/extractor.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");
const ex = t => extract(t, schema, lex, { source: "typed" });

const cases = (title, list) => describe(title, () => {
  for (const [text, onMeds, missed] of list) {
    test(`"${text}" -> on_meds ${onMeds}, missed_doses ${missed}`, () => {
      const r = ex(text);
      if (onMeds) assert.equal(r.on_meds.value, onMeds, "on_meds");
      assert.equal(r.missed_doses.value, missed, "missed_doses");
    });
  }
});

cases("good adherence", [
  ["Traitement bien suivi.", "yes", "no"],
  ["Prend ses médicaments correctement.", "yes", "no"],
  ["Médicaments pris correctement.", "yes", "no"],
  ["Comprimés pris régulièrement.", "yes", "no"],
  ["Traitement suivi correctement.", "yes", "no"],
  ["Prend son traitement tous les jours.", "yes", "no"],
  ["Aucun oubli.", "yes", "no"],
  ["Observance bonne.", "yes", "no"],
  ["Bonne observance.", "yes", "no"],
]);

cases("partial adherence", [
  ["Oublie rarement ses comprimés.", "yes", "sometimes"],
  ["Oublie parfois son traitement.", "yes", "sometimes"],
  ["Rares oublis.", "yes", "sometimes"],
  ["Oublie de temps en temps.", null, "sometimes"],
]);

cases("poor adherence", [
  ["Oublie souvent son traitement.", "yes", "yes"],
  ["Traitement mal suivi.", "yes", "yes"],
  ["Traitement pas bien suivi.", "yes", "yes"],
  ["Ne prend pas correctement ses médicaments.", "yes", "yes"],
  ["Médicaments pris irrégulièrement.", "yes", "yes"],
]);

describe("must NOT match as good adherence", () => {
  for (const t of ["Il suit bien le régime.", "Conseils sur le sel bien suivis.", "Revoir correctement la tension.",
    "Prend la tension tous les jours ? non.", "Pas de traitement."]) {
    test(`"${t}" is not missed_doses=no`, () => assert.notEqual(ex(t).missed_doses.value, "no"));
  }
  test('"Pas de traitement" -> on_meds no, missed_doses na', () => {
    const r = ex("Pas de traitement."); assert.equal(r.on_meds.value, "no"); assert.equal(r.missed_doses.value, "na");
  });
  test('"Traitement mal suivi" is never read as good adherence', () => assert.equal(ex("Traitement mal suivi").missed_doses.value, "yes"));
});
