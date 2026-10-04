// QA: demo phrases through extractor + HEARTS rules (typed). Expectations are the clinically correct ones.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { extract } from "../../app/web/engine/extractor.js";
import { checkProtocol } from "../../app/web/engine/rules.js";
import { ROOT } from "../helpers/server.mjs";

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json");
const lex = read("app/web/lexicon/fr.json");
export const { phrases } = read("tests/qa/demo_phrases.json");

export function checkRecord(rec, ph, label = "") {
  for (const [k, v] of Object.entries(ph.expect)) assert.equal(rec[k].value, v, `${label}${k}`);
  for (const k of ph.check || []) assert.equal(rec[k].check, true, `${label}${k} should be "please check"`);
  const codes = checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value]))).map(f => f.code);
  for (const c of ph.flags || []) assert.ok(codes.includes(c), `${label}missing flag ${c} (got ${codes.join(", ")})`);
  for (const c of ph.noflags || []) assert.ok(!codes.includes(c), `${label}unexpected flag ${c}`);
  if (ph.noGap) assert.deepEqual(codes, [], `${label}expected no protocol gap`);
}

describe("QA demo phrases: typed -> record -> HEARTS flags", () => {
  for (const ph of phrases) {
    test(`${ph.id}: ${ph.text.slice(0, 60)}`, { todo: ph.todo }, () => checkRecord(extract(ph.text, schema, lex, { source: "typed" }), ph));
  }
});
