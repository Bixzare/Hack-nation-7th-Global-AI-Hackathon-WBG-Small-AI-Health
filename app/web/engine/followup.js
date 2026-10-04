// Missed follow-ups: the next-visit date has passed and the same patient has no later visit.
// The tool only lists them; a person decides what to do (call, home visit, nothing).
import { addDuration } from "./outbox.js";

// Households share one basic phone, so a phone number does NOT identify a patient. Two records are the
// same patient only if the names match (and the phones too, when both are recorded). When we cannot
// tell (a name is missing), the visit stays on the list: the safe direction, a person decides.
const norm = s => (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const digits = s => (s ?? "").toString().replace(/\D/g, "");
function samePatient(a, b) {
  const na = norm(a.record.patient_name?.value), nb = norm(b.record.patient_name?.value);
  if (!na || !nb || na !== nb) return false;
  const pa = digits(a.record.phone?.value), pb = digits(b.record.phone?.value);
  return !pa || !pb || pa === pb;
}

export function missedFollowUps(records, todayIso) {
  const out = [];
  for (const r of records) {
    const v = k => r.record[k]?.value;
    if (v("referral") === "yes") continue;
    const due = addDuration(v("visit_date"), v("follow_up"));
    if (!due || due >= todayIso) continue;
    const returned = records.some(o => o !== r && samePatient(o, r) &&
      (o.record.visit_date?.value ?? "") > (v("visit_date") ?? ""));
    if (!returned) out.push({ id: r.id, name: v("patient_name"), phone: v("phone"), due });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// Synthetic demo history (clearly labelled) so the list can be shown without waiting two weeks.
export function demoHistory(todayIso) {
  const shift = days => { const d = new Date(todayIso + "T12:00:00"); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv"); };
  const rec = (name, phone, visit, fu) => ({
    created_at: new Date().toISOString(), note: "SYNTHETIC demo history", synthetic_demo: true,
    record: { patient_name: { value: name }, phone: { value: phone }, visit_date: { value: visit },
              follow_up: { value: fu }, referral: { value: "not_mentioned" }, bp1_sys: { value: 158 }, bp1_dia: { value: 96 } },
  });
  return [
    rec("Aïssa (synthétique)", "+227 90 00 00 01", shift(-19), "P2W"),   // due 5 days ago, never came back
    rec("Moussa (synthétique)", "+227 90 00 00 02", shift(-35), "P1M"),  // came back (next record)
    rec("Moussa (synthétique)", "+227 90 00 00 02", shift(-4), "P1M"),
  ];
}
