// Speech-mode selection and the on-device "please check" rule.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectAsrMode, isHostedLocation, flagAllSpeechFields } from "../../app/web/engine/asrmode.js";
import { extract } from "../../app/web/engine/extractor.js";
import { checkProtocol } from "../../app/web/engine/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = read("app/web/engine/schema.json"), lex = read("app/web/lexicon/fr.json");
const caps = { hasMic: true, hasWorker: true, hasAudio: true, ondeviceEnabled: true };

describe("speech mode selection", () => {
  test("local install + service up -> local Whisper service", () => assert.equal(selectAsrMode({ ...caps, hosted: false, serviceUp: true }), "service"));
  test("local install, service down -> on-device", () => assert.equal(selectAsrMode({ ...caps, hosted: false, serviceUp: false }), "ondevice"));
  test("hosted -> on-device, even if a service answered", () => assert.equal(selectAsrMode({ ...caps, hosted: true, serviceUp: true }), "ondevice"));
  test("no microphone -> none (typing + samples)", () => assert.equal(selectAsrMode({ ...caps, hasMic: false, hosted: true }), "none"));
  test("no Web Worker or no Web Audio -> none", () => {
    assert.equal(selectAsrMode({ ...caps, hasWorker: false, hosted: true }), "none");
    assert.equal(selectAsrMode({ ...caps, hasAudio: false, hosted: true }), "none");
  });
  test("on-device disabled in the profile -> none on hosted", () => assert.equal(selectAsrMode({ ...caps, ondeviceEnabled: false, hosted: true }), "none"));
  test("hosted detection: localhost / 127.0.0.1 / [::1] are local; anything else is hosted", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(isHostedLocation(h), false, h);
    for (const h of ["bixzare.github.io", "example.trycloudflare.com", "192.168.1.5"]) assert.equal(isHostedLocation(h), true, h);
  });
});

describe("on-device speech: EVERY field derived from speech is 'please check'", () => {
  test("typed-confident fields become 'please check' after on-device speech", () => {
    const text = "Femme, 38 ans. Tension 162 sur 98. Céphalées. Sous amlodipine, aucun oubli. Pas enceinte. Revoir dans deux semaines.";
    const rec = flagAllSpeechFields(extract(text, schema, lex, { source: "speech" }), schema);
    for (const k of ["sex", "age", "bp1_sys", "bp1_dia", "headache", "on_meds", "missed_doses", "pregnancy", "follow_up"]) {
      assert.equal(rec[k].check, true, k);
    }
  });
  test("'not mentioned' fields and admin fields are left to the normal rules", () => {
    const rec = flagAllSpeechFields(extract("Femme 38 ans", schema, lex, { source: "speech" }), schema);
    assert.equal(rec.chest_pain.value, "not_mentioned"); assert.equal(rec.chest_pain.check, false);
    assert.equal(rec.patient_name.reason, undefined);
  });
  test("sound-alike corrections stay flagged in on-device mode", () => {
    const rec = flagAllSpeechFields(extract("FAM 35 ans, c'est fallé", schema, lex, { source: "speech" }), schema);
    assert.equal(rec.sex.check, true); assert.equal(rec.headache.check, true);
  });
});

describe("on-device mode: a MISSED danger symptom is still caught by the screening prompt", () => {
  test("raised BP + symptoms 'not mentioned' (on-device) -> 'ask about danger signs' flag", () => {
    const rec = flagAllSpeechFields(extract("Homme 58 ans, tension 172 sur 104, revoir dans deux semaines", schema, lex, { source: "speech" }), schema);
    assert.equal(rec.headache.value, "not_mentioned");
    const codes = checkProtocol(Object.fromEntries(Object.entries(rec).map(([k, x]) => [k, x.value]))).map(f => f.code);
    assert.ok(codes.includes("ask_danger_symptoms"));
  });
});
