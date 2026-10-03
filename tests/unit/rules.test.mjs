// HEARTS rule tests at threshold edges. Thresholds: raised >=140/90; urgent >180/110 with a danger symptom;
// urgent >200/120 alone (WHO HEARTS 2018 p.36; WHO 2021).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkProtocol, durationDays } from "../../app/web/engine/rules.js";

const base = { sex: "M", age: 50, bp1_sys: null, bp1_dia: null, bp2_sys: null, bp2_dia: null,
  headache: "absent", chest_pain: "absent", blurred_vision: "absent", breathless: "absent",
  on_meds: "yes", missed_doses: "no", pregnancy: "na", counselling: "yes", referral: "not_mentioned", follow_up: "P1M" };
const codes = v => checkProtocol({ ...base, ...v }).map(f => f.code);
const level = (v, code) => checkProtocol({ ...base, ...v }).find(f => f.code === code)?.level;

describe("raised BP threshold (>=140/90)", () => {
  test("139/89 is not raised", () => {
    const c = codes({ bp1_sys: 139, bp1_dia: 89, on_meds: "no", missed_doses: "na" });
    assert.ok(!c.includes("second_reading") && !c.includes("confirm_other_day"));
  });
  test("140/89 is raised (systolic)", () => assert.ok(codes({ bp1_sys: 140, bp1_dia: 89, on_meds: "no" }).includes("confirm_other_day")));
  test("139/90 is raised (diastolic)", () => assert.ok(codes({ bp1_sys: 139, bp1_dia: 90, on_meds: "no" }).includes("confirm_other_day")));
  test("second reading is used when present", () => {
    const c = codes({ bp1_sys: 150, bp1_dia: 95, bp2_sys: 135, bp2_dia: 85, on_meds: "no" });
    assert.ok(!c.includes("confirm_other_day"));
  });
});

describe("urgent referral", () => {
  test("180/110 with headache is NOT urgent (strictly above)", () =>
    assert.ok(!codes({ bp1_sys: 180, bp1_dia: 110, headache: "present" }).includes("urgent_bp_with_symptoms")));
  test("181/100 with headache is urgent", () =>
    assert.equal(level({ bp1_sys: 181, bp1_dia: 100, headache: "present" }, "urgent_bp_with_symptoms"), "urgent"));
  test("170/111 with blurred vision is urgent", () =>
    assert.ok(codes({ bp1_sys: 170, bp1_dia: 111, blurred_vision: "present" }).includes("urgent_bp_with_symptoms")));
  test("185/115 without symptoms is not 'with symptoms'", () =>
    assert.ok(!codes({ bp1_sys: 185, bp1_dia: 115 }).includes("urgent_bp_with_symptoms")));
  test("185/115 with an UNCERTAIN symptom -> urgent if confirmed", () =>
    assert.equal(level({ bp1_sys: 185, bp1_dia: 115, breathless: "uncertain" }, "urgent_if_symptoms_confirmed"), "urgent"));
  test("201/90 alone is urgent", () => assert.equal(level({ bp1_sys: 201, bp1_dia: 90 }, "urgent_bp_very_high"), "urgent"));
  test("200/120 alone is not 'very high' (strictly above)", () =>
    assert.ok(!codes({ bp1_sys: 200, bp1_dia: 120 }).includes("urgent_bp_very_high")));
  test("chest pain at any BP is urgent", () => assert.equal(level({ bp1_sys: 125, bp1_dia: 80, chest_pain: "present" }, "urgent_chest_pain"), "urgent"));
});

describe("danger-sign screening flag (alert-fatigue rule)", () => {
  test("not raised + symptom not mentioned -> no screening flag", () =>
    assert.ok(!codes({ bp1_sys: 130, bp1_dia: 80, headache: "not_mentioned" }).includes("ask_danger_symptoms")));
  test("raised + symptom not mentioned -> gap", () =>
    assert.equal(level({ bp1_sys: 150, bp1_dia: 95, headache: "not_mentioned" }, "ask_danger_symptoms"), "gap"));
  test("very raised (>180/110) + not mentioned -> urgent", () =>
    assert.equal(level({ bp1_sys: 185, bp1_dia: 100, headache: "not_mentioned" }, "ask_danger_symptoms"), "urgent"));
});

describe("missing data and other gaps", () => {
  test("BP not measured -> bp_missing gap (approval needs a reason in the UI)", () =>
    assert.equal(level({ bp1_sys: null, bp1_dia: null }, "bp_missing"), "gap"));
  test("woman 15-49, pregnancy not recorded -> gap", () =>
    assert.ok(codes({ sex: "F", age: 30, pregnancy: "not_mentioned", bp1_sys: 120, bp1_dia: 80 }).includes("pregnancy_unknown")));
  test("woman 50 -> no pregnancy gap", () =>
    assert.ok(!codes({ sex: "F", age: 50, pregnancy: "not_mentioned", bp1_sys: 120, bp1_dia: 80 }).includes("pregnancy_unknown")));
  test("pregnant + raised -> refer", () =>
    assert.equal(level({ sex: "F", age: 30, pregnancy: "pregnant", bp1_sys: 145, bp1_dia: 92 }, "refer_pregnant_htn"), "refer"));
  test("under 40 + raised -> refer", () => assert.equal(level({ age: 39, bp1_sys: 145, bp1_dia: 92 }, "refer_young_htn"), "refer"));
  test("raised + follow-up 3 months -> check (WHO: monthly)", () =>
    assert.equal(level({ bp1_sys: 150, bp1_dia: 95, follow_up: "P3M" }, "follow_up_too_long"), "check"));
  test("no follow-up and not referred -> gap", () => assert.ok(codes({ bp1_sys: 120, bp1_dia: 80, follow_up: "not_mentioned" }).includes("follow_up_missing")));
  test("referred -> no follow-up gap", () => assert.ok(!codes({ bp1_sys: 120, bp1_dia: 80, follow_up: "not_mentioned", referral: "yes" }).includes("follow_up_missing")));
  test("durationDays", () => { assert.equal(durationDays("P2W"), 14); assert.equal(durationDays("P1M"), 30); assert.equal(durationDays("x"), null); });
});
