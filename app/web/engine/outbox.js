// Store-and-forward outbox (simulated gateway). Messages carry codes + params, never clinical content.
import * as store from "./store.js";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // JS getDay() order

export function weekdayCode(isoDate) {
  return WEEKDAYS[new Date(isoDate + "T12:00:00").getDay()];
}

// Build reminders from an approved record. Only a follow-up date and a phone number are used.
export function remindersFor(recordId, values, profile) {
  if (!values.follow_up_date || !values.phone) return [];
  const weekday = weekdayCode(values.follow_up_date);
  const base = { record_id: recordId, to: values.phone, send_at: profile.reminder_send_time, status: "queued" };
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

// Simulated send: only when online. Offline messages stay queued (store-and-forward).
export async function flush() {
  if (!navigator.onLine) return 0;
  let n = 0;
  for (const m of await store.all("outbox")) {
    if (m.status === "queued") { await store.put("outbox", { ...m, status: "sent", sent_at: new Date().toISOString() }); n++; }
  }
  return n;
}
