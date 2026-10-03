// WHO HEARTS / WHO 2021 protocol checks. Input: record values (codes). Output: flag codes, no language.
// Sources (verified against the PDFs, 3 Oct 2026):
//   [H] WHO HEARTS technical package, Evidence-based treatment protocols, WHO/NMH/NVI/18.2 (2018)
//   [G] WHO Guideline for the pharmacological treatment of hypertension in adults (2021)
//   [R] WHO indicator definition of women of reproductive age: 15-49 years (TODO-CLINICAL: standard WHO GHO
//       definition, not re-fetched; HEARTS itself says 'women of childbearing age' without an age range)
// Levels: "urgent" (ask a clinician / refer today), "refer" (non-emergency referral), "gap" (missing step),
// "check" (something to confirm). The tool never diagnoses; it signposts to a person.

const RAISED = { sys: 140, dia: 90 };       // [H] 'Diagnosis' / [G] rec. 1: SBP >=140 and/or DBP >=90
const URGENT_SYMPT = { sys: 180, dia: 110 }; // [H] p.36: BP >180/110 with severe headache, chest pain, SOB, blurred vision...
const URGENT_ANY = { sys: 200, dia: 120 };   // [H] p.36: BP >200/>120
const DANGER = ["headache", "chest_pain", "breathless", "blurred_vision"];
const MONTH_DAYS = 31;                        // [G] rec. 7: monthly follow-up until at target

function bp(v) {
  // [H] 'How to measure blood pressure': when two readings are taken, use the second reading.
  const s = v.bp2_sys ?? v.bp1_sys, d = v.bp2_dia ?? v.bp1_dia;
  return s == null || d == null ? null : { s: Number(s), d: Number(d) };
}

export function durationDays(iso) {
  const m = /^P(\d+)([DWM])$/.exec(iso || "");
  return m ? Number(m[1]) * { D: 1, W: 7, M: 30 }[m[2]] : null;
}

export function checkProtocol(v) {
  const flags = [];
  const add = (code, level) => flags.push({ code, level });
  const p = bp(v);
  const raised = p && (p.s >= RAISED.sys || p.d >= RAISED.dia);
  const present = DANGER.filter(k => v[k] === "present");
  const uncertain = DANGER.filter(k => v[k] === "uncertain");

  if (!p) add("bp_missing", "gap");

  // Urgent referral criteria [H] p.36
  if (p && (p.s > URGENT_ANY.sys || p.d > URGENT_ANY.dia)) add("urgent_bp_very_high", "urgent");
  else if (p && (p.s > URGENT_SYMPT.sys || p.d > URGENT_SYMPT.dia)) {
    if (present.length) add("urgent_bp_with_symptoms", "urgent");
    else if (uncertain.length) add("urgent_if_symptoms_confirmed", "urgent");
  }
  // [H] p.36: "Screen each patient for danger signs that would suggest the need for immediate referral."
  // To avoid alert fatigue the flag fires only when BP is raised ([H] 'Diagnosis': >=140/90) AND a danger
  // symptom is not recorded. Every visit also requires a one-tap "danger signs asked" confirmation (UI).
  if (raised && DANGER.some(k => v[k] === "not_mentioned"))
    add("ask_danger_symptoms", p.s > URGENT_SYMPT.sys || p.d > URGENT_SYMPT.dia ? "urgent" : "gap");
  if (v.chest_pain === "present") add("urgent_chest_pain", "urgent");        // [H] p.36 new chest pain
  if (v.breathless === "present") add("urgent_breathless", "urgent");        // [H] p.36 heart failure signs
  if (v.blurred_vision === "present") add("urgent_vision", "urgent");         // [H] p.36 recent deterioration of vision
  if (uncertain.length) add("symptom_uncertain", "check");

  // Non-emergency referral [H] p.37
  if (raised && v.pregnancy === "pregnant") add("refer_pregnant_htn", "refer");
  if (raised && v.age != null && Number(v.age) < 40) add("refer_young_htn", "refer");

  // Protocol gaps
  if (raised && v.on_meds !== "yes" && v.bp2_sys == null) add("second_reading", "gap"); // [H] 'How to measure blood pressure': >=2 readings at first measurement
  if (raised && v.on_meds !== "yes") add("confirm_other_day", "check");                 // [G] confirmed on two different days
  if (v.sex === "F" && v.age != null && Number(v.age) >= 15 && Number(v.age) <= 49 && v.pregnancy === "not_mentioned")
    add("pregnancy_unknown", "gap");                                                      // [H] 'Notes on specific hypertension medications': no ACE-I/ARB/thiazide; [R]
  if (v.on_meds === "yes" && v.missed_doses === "not_mentioned") add("adherence_unknown", "gap"); // [H] 'Adherence' notes
  if (v.referral !== "yes") {
    if (!v.follow_up || v.follow_up === "not_mentioned") add("follow_up_missing", "gap");
    else if (raised && durationDays(v.follow_up) > MONTH_DAYS) add("follow_up_too_long", "check"); // [G] rec. 7
  }
  if (v.counselling !== "yes") add("counselling_missing", "gap"); // [H] healthy-lifestyle counselling module
  if (v.sex === "unknown") add("sex_unknown", "gap");
  return flags;
}
