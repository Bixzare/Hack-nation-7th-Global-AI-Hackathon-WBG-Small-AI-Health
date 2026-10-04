// QA: missed follow-up identity. The scenario says households SHARE one basic phone, so two different
// patients can have the same phone number. A visit by one must not hide the other's missed follow-up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missedFollowUps } from "../../app/web/engine/followup.js";

const rec = (id, name, phone, visit, fu) => ({ id, record: { patient_name: { value: name }, phone: { value: phone },
  visit_date: { value: visit }, follow_up: { value: fu }, referral: { value: "not_mentioned" } } });

test("same patient came back -> not listed", () => {
  const r = [rec(1, "Moussa", "+227 1", "2026-09-01", "P2W"), rec(2, "Moussa", "+227 1", "2026-09-16", "P1M")];
  assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), []);
});

test("patient never came back -> listed", () => {
  assert.deepEqual(missedFollowUps([rec(1, "Aïssa", "+227 2", "2026-09-01", "P2W")], "2026-10-04").map(m => m.id), [1]);
});

// Fixed after QA (was: matched by phone first, so a relative's visit on a shared phone hid a missed one).
test("shared household phone: another patient's visit must not hide a missed follow-up", () => {
    const r = [rec(1, "Aïssa", "+227 90 00 00 01", "2026-09-01", "P2W"), rec(2, "Noor", "+227 90 00 00 01", "2026-10-03", "P2W")];
    assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), [1]);
  });

test("same name, phone recorded only once -> same patient (came back)", () => {
  const r = [rec(1, "Moussa", "+227 1", "2026-09-01", "P2W"), rec(2, "  moussa ", "", "2026-09-20", "P1M")];
  assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), []);
});

test("accents / case in the name do not matter", () => {
  const r = [rec(1, "Aïssa", "+227 90 00 00 01", "2026-09-01", "P2W"), rec(2, "AISSA", "+227 90000001", "2026-09-20", "P1M")];
  assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), []);
});

test("same name but different phones -> treated as different people (stays listed)", () => {
  const r = [rec(1, "Ali", "+227 1", "2026-09-01", "P2W"), rec(2, "Ali", "+227 2", "2026-09-20", "P1M")];
  assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), [1]);
});

test("missing name -> cannot tell -> stays listed (safe direction)", () => {
  const r = [rec(1, "", "+227 1", "2026-09-01", "P2W"), rec(2, "", "+227 1", "2026-09-20", "P1M")];
  assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), [1]);
});

test("referred patients are never listed as missed", () => {
  const r = [{ ...rec(1, "Ibrahim", "+227 3", "2026-09-01", "P2W") }];
  r[0].record.referral = { value: "yes" };
  assert.deepEqual(missedFollowUps(r, "2026-10-04"), []);
});
