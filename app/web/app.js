import { loadProfile, makeT } from "./engine/i18n.js";
import { extract, emptyRecord } from "./engine/extractor.js";
import { loadClassifier } from "./engine/classifier.js";
import { checkProtocol } from "./engine/rules.js";
import * as store from "./engine/store.js";
import * as pin from "./engine/pin.js";
import * as outbox from "./engine/outbox.js";
import { missedFollowUps, demoHistory } from "./engine/followup.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

let P, t, tSms, SCHEMA, LEX, CLF = null, RECORD = null;
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD, local time

// ---------- static text ----------
function paintText() {
  document.documentElement.lang = P.worker_locale;
  $("banner").textContent = t("banner");
  $("title").textContent = t("app.title");
  $("disclaimer").textContent = t("app.disclaimer");
  $("btnLock").textContent = t("pin.lock");
  $("consentLabel").textContent = t("consent");
  $("note").placeholder = t("note.placeholder");
  $("btnFill").textContent = t("note.fill");
  $("samplesTitle").textContent = t("note.samples");
  $("flagsTitle").textContent = t("flags.title");
  $("btnApprove").textContent = t("approve");
  $("dangerAskedLabel").textContent = t("danger_asked");
  $("bpNotMeasuredLabel").textContent = t("bp_not_measured");
  $("bpReasonOther").placeholder = t("bp_reason.other_text");
  $("bpReason").replaceChildren(el("option", { value: "", textContent: "—" }),
    ...["device_unavailable", "patient_refused", "other"].map(r => el("option", { value: r, textContent: t("bp_reason." + r) })));
  $("outboxTitle").textContent = t("outbox.title");
  $("btnSend").textContent = t("outbox.simulate");
  $("savedTitle").textContent = t("saved.title");
  $("missedTitle").textContent = t("missed.title");
  $("btnDemoHistory").textContent = t("missed.demo");
}

function paintNet() {
  const on = navigator.onLine;
  $("net").textContent = on ? t("net.online") : t("net.offline");
  $("net").classList.toggle("off", !on);
}

// ---------- PIN gate ----------
function showPin() {
  $("appBody").hidden = true; $("pinGate").hidden = false; $("btnLock").hidden = true;
  $("pinLabel").textContent = pin.hasPin() ? t("pin.enter") : t("pin.set");
  $("btnPin").textContent = t("pin.button");
  $("pinInput").value = ""; $("pinMsg").textContent = "";
  $("pinInput").focus();
}

async function submitPin() {
  const v = $("pinInput").value;
  if (!/^\d{4}$/.test(v)) { $("pinMsg").textContent = t("pin.set"); return; }
  if (!pin.hasPin()) await pin.setPin(v);
  else if (!(await pin.checkPin(v))) { $("pinMsg").textContent = t("pin.wrong"); return; }
  $("pinGate").hidden = true; $("appBody").hidden = false; $("btnLock").hidden = false;
  refreshLists();
}

// ---------- record form ----------
function renderRecord() {
  const form = $("form"); form.replaceChildren();
  for (const [name, spec] of Object.entries(SCHEMA.fields)) {
    const f = RECORD[name];
    let input;
    if (spec.kind === "enum") {
      input = el("select");
      input.append(el("option", { value: "", textContent: "—" }));
      for (const v of spec.values) input.append(el("option", { value: v, textContent: t("enum." + v) }));
    } else {
      input = el("input", { type: spec.kind === "int" ? "number" : spec.kind === "date" ? "date" : "text" });
      if (spec.kind === "int") input.inputMode = "numeric";
    }
    input.value = f.value ?? "";
    input.onchange = () => { f.value = input.value === "" ? null : input.value; f.source = "typed"; f.check = false; renderRecord(); };
    const ok = el("button", { className: "secondary small confirm", textContent: t("field.confirm"), hidden: !f.check });
    ok.onclick = () => { f.check = false; renderRecord(); };
    const label = el("label", {}, t("field." + name), el("span", { className: "tag", textContent: f.check ? t("field.check") : t("field.ok") }));
    const box = el("div", { className: "field " + (f.check ? "check" : "ok") }, label, el("div", { className: "line" }, input, ok));
    box.dataset.field = name;
    if (f.source === "speech" && spec.numeric_bp && f.check) box.append(el("div", { className: "hint", textContent: t("note.source_speech") }));
    if (name === "follow_up") {
      const d = outbox.addDuration(RECORD.visit_date.value, f.value);
      if (d) box.append(el("div", { className: "hint", textContent: t("follow_up.date", { date: fmtDate(d) }) }));
    }
    form.append(box);
  }
  renderFlags();
  const left = Object.values(RECORD).filter(f => f.check).length;
  $("btnApprove").disabled = left > 0 || !$("consent").checked || !$("dangerAsked").checked || !bpOk();
  $("status").textContent = left ? t("status.left", { n: left }) : t("status.ready");
}

// Approval needs a BP value, or an explicit "BP not measured" with a reason (recorded with the visit).
function bpOk() {
  const has = RECORD.bp1_sys.value != null && RECORD.bp1_dia.value != null;
  const reason = $("bpReason").value;
  return has || ($("bpNotMeasured").checked && reason && (reason !== "other" || $("bpReasonOther").value.trim()));
}

let DANGER_AT = null; // when the health worker confirmed asking about danger signs

function values() {
  return Object.fromEntries(Object.entries(RECORD).map(([k, f]) => [k, f.value]));
}

// The danger-sign screening flag is resolved (not deleted) by the health worker's confirmation.
function resolveFlags(flags) {
  return flags.map(f => f.code === "ask_danger_symptoms" && $("dangerAsked").checked && DANGER_AT
    ? { ...f, level: "resolved", resolved: true, resolved_at: DANGER_AT } : f);
}

const fmtTime = iso => new Date(iso).toLocaleTimeString(P.worker_locale, { hour: "2-digit", minute: "2-digit" });

function renderFlags() {
  const order = { urgent: 0, refer: 1, check: 2, gap: 3, resolved: 4 };
  const flags = resolveFlags(checkProtocol(values())).sort((a, b) => order[a.level] - order[b.level]);
  $("flags").replaceChildren(...(flags.length
    ? flags.map(f => el("li", { className: "flag " + (f.resolved ? "resolved" : f.level),
        textContent: f.resolved ? t("flag.danger_asked_confirmed", { time: fmtTime(f.resolved_at) }) : t("flag." + f.code) }))
    : [el("li", { textContent: t("flags.none") })]));
}

async function approve() {
  const v = values();
  const bpMissing = RECORD.bp1_sys.value == null || RECORD.bp1_dia.value == null;
  const id = await store.add("records", { created_at: new Date().toISOString(), note: $("note").value, record: RECORD,
    flags: resolveFlags(checkProtocol(v)),
    danger_signs_asked: { confirmed: true, at: DANGER_AT },
    bp_not_measured: bpMissing ? { reason: $("bpReason").value, other: $("bpReasonOther").value.trim() || null } : null });
  await outbox.queue(outbox.remindersFor(id, v, P));
  RECORD = null; $("recordBox").hidden = true; $("note").value = ""; $("consent").checked = false; $("dangerAsked").checked = false; DANGER_AT = null;
  $("bpNotMeasured").checked = false; $("bpReason").value = ""; $("bpReasonOther").value = ""; $("bpReasonRow").hidden = true;
  $("status").textContent = "";
  refreshLists();
  alertSaved(id);
}

function alertSaved(id) {
  const s = el("div", { className: "status", textContent: t("status.saved", { id }) });
  $("recordBox").before(s); setTimeout(() => s.remove(), 4000);
}

// ---------- outbox ----------
let playing = null;
function playSequence(codes) {
  playing?.pause();
  const files = codes.map(c => P.packs.voice.voice[c]);
  let i = 0;
  const next = () => {
    if (i >= files.length) return;
    playing = new Audio(files[i++]);
    playing.onended = next;
    playing.onerror = next; // missing clip: skip, it's shown as a placeholder in the list
    playing.play().catch(next);
  };
  next();
}

async function clipExists(path) {
  try { return (await fetch(path)).ok; } catch { return false; } // GET so the service worker can answer offline
}

async function renderOutbox() {
  const msgs = (await store.all("outbox")).reverse();
  if (!msgs.length) { $("outbox").textContent = t("outbox.empty"); return; }
  const rows = [];
  for (const m of msgs) {
    const when = fmtDate(m.send_at.slice(0, 10)) + " " + m.send_at.slice(11);
    const state = m.status === "sent" ? t("outbox.sent")
      : t("outbox.queued", { time: when }) + (navigator.onLine ? "" : " · " + t("outbox.offline"));
    const meta = el("div", { className: "meta", textContent: `→ ${m.to} · ${state}` });
    if (m.kind === "voice") {
      const codes = outbox.clipCodes(m, P.packs.voice);
      const missing = [];
      for (const c of codes) if (!(await clipExists(P.packs.voice.voice[c]))) missing.push(c);
      const btn = el("button", { className: "secondary small", textContent: "▶ " + t("outbox.play") });
      btn.onclick = () => playSequence(codes);
      rows.push(el("div", { className: "msg" },
        el("div", {}, `🔊 ${t("outbox.voice", { locale: m.locale })}: `, el("code", { textContent: codes.join(" + ") }), " ", btn),
        ...missing.map(c => el("div", { className: "meta", textContent: t("outbox.missing_clip", { clip: c }) })),
        meta));
    } else {
      const text = tSms(m.template, { ...m.params, weekday: tSms("weekday." + m.params.weekday) });
      rows.push(el("div", { className: "msg" }, el("div", { textContent: `✉ ${t("outbox.sms")}: « ${text} »` }), meta));
    }
  }
  $("outbox").replaceChildren(...rows);
}

async function renderSaved() {
  const recs = (await store.all("records")).reverse();
  $("saved").replaceChildren(...(recs.length ? recs.map(r => {
    const v = k => r.record[k]?.value ?? "?";
    return el("div", { textContent: `#${r.id} · ${new Date(r.created_at).toLocaleString(P.worker_locale, { dateStyle: "short", timeStyle: "short" })} · ${v("patient_name")} · TA ${v("bp1_sys")}/${v("bp1_dia")}` });
  }) : [document.createTextNode(t("saved.none"))]));
}

function refreshLists() { renderOutbox(); renderSaved(); renderMissed(); }

async function renderMissed() {
  const missed = missedFollowUps(await store.all("records"), today());
  $("missed").replaceChildren(...(missed.length ? missed.map(m => el("div", { className: "msg" },
    el("div", { textContent: `${m.name || "?"} · ${m.phone || ""}` }),
    el("div", { className: "meta", textContent: t("missed.due", { date: fmtDate(m.due) }) }))) : [document.createTextNode(t("missed.none"))]));
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(P.worker_locale, { weekday: "long", day: "numeric", month: "long" });
}

// ---------- samples + speech service ----------
async function loadSamples() {
  let samples = [];
  try { samples = await (await fetch("samples/samples.json")).json(); } catch {}
  if (!samples.length) { $("samples").textContent = t("note.samples_none"); return; }
  $("samples").replaceChildren(...samples.map(s => {
    const b = el("button", { className: "secondary sample" },
      el("div", { textContent: s.title }),
      el("div", { className: "sub", textContent: t("note.samples_label", { model: s.model }) }));
    b.onclick = () => { if (s.audio) new Audio(s.audio).play().catch(() => {}); $("note").value = s.transcript; $("note").dataset.source = "speech"; };
    return b;
  }));
}

async function probeSpeech() {
  // Hosted demo: never reach for the visitor's localhost (Chrome would ask for local-network permission).
  // Live dictation is for the health-centre install, where the page itself is served locally.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    $("speech").textContent = t("speech.hosted");
    return;
  }
  let ok = false;
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 800);
    ok = (await fetch(P.speech_service_url + "/health", { signal: ctl.signal })).ok;
  } catch {}
  $("speech").textContent = ok ? t("speech.available") : t("speech.unavailable");
  $("btnMic").hidden = !ok || !navigator.mediaDevices?.getUserMedia;
  $("btnMic").textContent = t("speech.record");
}

// Live dictation: record in the browser, transcribe on the LOCAL service (audio never leaves the device).
let rec = null;
async function toggleMic() {
  if (rec) { rec.stop(); return; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach(tr => tr.stop());
    rec = null;
    $("btnMic").textContent = t("speech.working"); $("btnMic").disabled = true;
    try {
      const r = await fetch(P.speech_service_url + "/transcribe", { method: "POST", body: new Blob(chunks) });
      const j = await r.json();
      if (j.text) { $("note").value = j.text; $("note").dataset.source = "speech"; }
      $("speech").textContent = j.text ? t("speech.done", { s: j.proc_s }) : t("speech.unavailable");
    } catch { $("speech").textContent = t("speech.unavailable"); }
    $("btnMic").textContent = t("speech.record"); $("btnMic").disabled = false;
  };
  rec.start();
  $("btnMic").textContent = t("speech.stop");
}

// ---------- boot ----------
(async () => {
  P = await loadProfile();
  t = makeT(P.packs.worker, P.packs.fallback);
  tSms = makeT(P.packs.sms, P.packs.fallback);
  SCHEMA = await (await fetch("engine/schema.json")).json();
  LEX = await (await fetch(`lexicon/${P.lexicon}.json`)).json();
  // Rules-only by default: on the gold test the classifier added nothing (errors are upstream: lexicon
  // coverage and ASR). It stays available behind profile.use_classifier.
  if (P.use_classifier) try { const r = await fetch("models/symptom_clf.json"); if (r.ok) CLF = loadClassifier(await r.json()); } catch {}
  paintText(); paintNet(); showPin();

  $("btnPin").onclick = submitPin;
  $("pinInput").onkeydown = e => { if (e.key === "Enter") submitPin(); };
  $("btnLock").onclick = showPin;
  $("btnFill").onclick = () => {
    const source = $("note").dataset.source || "typed";
    try { RECORD = extract($("note").value, SCHEMA, LEX, { source, classifier: CLF }); }
    catch { RECORD = emptyRecord(SCHEMA); } // safe default: nothing pre-filled, everything "please check"
    RECORD.visit_date = { value: today(), confidence: 1, source: "typed", check: false };
    $("recordBox").hidden = false; renderRecord();
  };
  $("consent").onchange = () => RECORD && renderRecord();
  $("dangerAsked").onchange = () => { DANGER_AT = $("dangerAsked").checked ? new Date().toISOString() : null; RECORD && renderRecord(); };
  $("bpNotMeasured").onchange = () => { $("bpReasonRow").hidden = !$("bpNotMeasured").checked; RECORD && renderRecord(); };
  $("bpReason").onchange = () => { $("bpReasonOther").hidden = $("bpReason").value !== "other"; RECORD && renderRecord(); };
  $("bpReasonOther").oninput = () => RECORD && renderRecord();
  $("note").oninput = () => { delete $("note").dataset.source; };
  $("btnApprove").onclick = approve;
  $("btnMic").onclick = toggleMic;
  $("btnDemoHistory").onclick = async () => { for (const r of demoHistory(today())) await store.add("records", r); refreshLists(); };
  $("btnSend").onclick = async () => { await outbox.flush(); renderOutbox(); };
  addEventListener("online", () => { paintNet(); renderOutbox(); });
  addEventListener("offline", () => { paintNet(); renderOutbox(); });

  loadSamples(); probeSpeech();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
