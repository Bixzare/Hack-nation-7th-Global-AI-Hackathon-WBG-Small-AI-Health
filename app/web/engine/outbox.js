// Store-and-forward outbox (simulated gateway). Messages carry codes + params, never clinical content.
import * as store from "./store.js";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // JS getDay() order

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = iso => new Date(iso + "T12:00:00");

export function weekdayCode(isoDate) {
  return WEEKDAYS[parse(isoDate).getDay()];
}

// visit date + ISO-8601 duration (P2W, P1M, P3D) -> follow-up date (YYYY-MM-DD)
export function addDuration(isoDate, dur) {
  const m = /^P(\d+)([DWM])$/.exec(dur || "");
  if (!isoDate || !m) return null;
  const d = parse(isoDate), n = Number(m[1]);
  if (m[2] === "M") d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * (m[2] === "W" ? 7 : 1));
  return ymd(d);
}

// Build reminders from an approved record. Uses only the next-visit date and the phone number.
// The voice clip says "you will come back this coming <day>", so it is sent in the evening
// 1-2 days BEFORE the visit (profile.reminder_days_before), which keeps "this coming" correct.
export function remindersFor(recordId, values, profile) {
  if (!values.phone || values.referral === "yes") return [];
  const visit = addDuration(values.visit_date, values.follow_up);
  if (!visit) return [];
  const before = Math.min(2, Math.max(1, profile.reminder_days_before ?? 1));
  const send = parse(visit);
  send.setDate(send.getDate() - before);
  const weekday = weekdayCode(visit);
  const base = { record_id: recordId, to: values.phone, visit_date: visit,
                 send_at: `${ymd(send)}T${profile.reminder_send_time}`, status: "queued" };
  return [
    { ...base, kind: "voice", locale: profile.patient_voice_locale, sequence: "follow_up", params: { weekday } },
    { ...base, kind: "sms", locale: profile.sms_locale, template: "sms.follow_up", params: { weekday, clinic: profile.clinic_name } },
  ];
}

export async function queue(messages) {
  for (const m of messages) await store.add("outbox", { ...m, queued_at: new Date().toISOString() });
}

// Expand a voice sequence into clip codes, e.g. ["intro", "{weekday}", "clinic"] -> ["intro", "tue", "clinic"].
export function clipCodes(msg, voicePack) {
  return voicePack.sequences[msg.sequence].map(c => c.replace(/\{(\w+)\}/g, (_, k) => msg.params[k]));
}

// Simulated evening send: only when online. Offline messages stay queued (store-and-forward).
export async function flush() {
  if (!navigator.onLine) return 0;
  let n = 0;
  for (const m of await store.all("outbox")) {
    if (m.status === "queued") { await store.put("outbox", { ...m, status: "sent", sent_at: new Date().toISOString() }); n++; }
  }
  return n;
}
