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

test("shared household phone: another patient's visit must not hide a missed follow-up",
  { todo: "BUG (found in QA): followup.js matches patients by phone first, so a relative's later visit on the same shared phone hides Aïssa's missed visit. Proposed fix: match on name + phone." }, () => {
    const r = [rec(1, "Aïssa", "+227 90 00 00 01", "2026-09-01", "P2W"), rec(2, "Noor", "+227 90 00 00 01", "2026-10-03", "P2W")];
    assert.deepEqual(missedFollowUps(r, "2026-10-04").map(m => m.id), [1]);
  });
