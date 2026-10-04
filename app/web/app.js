import { loadProfile, makeT } from "./engine/i18n.js";
import { extract, emptyRecord } from "./engine/extractor.js";
import { loadClassifier } from "./engine/classifier.js";
import { checkProtocol } from "./engine/rules.js";
import * as store from "./engine/store.js";
import * as pin from "./engine/pin.js";
import * as outbox from "./engine/outbox.js";
import { missedFollowUps, demoHistory } from "./engine/followup.js";
import { selectAsrMode, isHostedLocation, flagAllSpeechFields } from "./engine/asrmode.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

let P, t, tSms, SCHEMA, LEX, CLF = null, RECORD = null, UI = "fr";
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD, local time

// ---------- static text ----------
function paintText() {
  document.documentElement.lang = UI;
  $("lang").replaceChildren(...Object.keys(P.packs.ui).map(l => {
    const b = el("button", { className: "small" + (l === UI ? " active" : ""), textContent: l.toUpperCase() });
    b.setAttribute("aria-pressed", String(l === UI)); b.onclick = () => setUI(l);
    return b;
  }));
  $("banner").textContent = t("banner");
  $("title").textContent = t("app.title");
  $("step1Title").textContent = t("step1.title");
  $("step2Title").textContent = t("step2.title");
  $("step3Title").textContent = t("step3.title");
  $("deviceCaptionNurse").textContent = t("device.nurse");
  $("deviceCaptionNoor").textContent = t("device.noor");
  $("offlineHint").textContent = t("offline.hint");
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
    const empty = f.value == null || f.value === "";
    const state = f.check ? "check" : empty ? "empty" : "ok"; // an empty field is never shown as "confirmed"
    const label = el("label", {}, t("field." + name), el("span", { className: "tag", textContent: t("field." + state) }));
    const box = el("div", { className: "field " + state }, label, el("div", { className: "line" }, input, ok));
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
  renderSteps();
}

// Step indicator: Dictate -> Review -> Approve -> Reminder
let APPROVED = false;
function renderSteps() {
  const left = RECORD ? Object.values(RECORD).filter(f => f.check).length : 0;
  const cur = APPROVED ? 4 : !RECORD ? 1 : left > 0 ? 2 : 3;
  $("steps").replaceChildren(...["dictate", "review", "approve", "reminder"].map((k, i) =>
    el("li", { className: i + 1 < cur || (APPROVED && i === 3) ? "done" : i + 1 === cur ? "current" : "", textContent: t("step." + k) })));
  $("steps").children[cur - 1]?.setAttribute("aria-current", "step");
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

const fmtTime = iso => new Date(iso).toLocaleTimeString(UI, { hour: "2-digit", minute: "2-digit" });

function renderFlags() {
  const order = { urgent: 0, refer: 1, check: 2, gap: 3, resolved: 4 };
  const flags = resolveFlags(checkProtocol(values())).sort((a, b) => order[a.level] - order[b.level]);
  const ICON = { urgent: "⚠", refer: "➜", check: "?", gap: "○", resolved: "✓", info: "ⓘ" };
  const card = (level, text) => el("li", { className: "flag " + level },
    el("span", { className: "ico", textContent: ICON[level], ariaHidden: "true" }),
    el("span", { className: "word", textContent: t("flagword." + level) }),
    el("span", { className: "txt", textContent: text }));
  // "No gap found" is an info card, never styled as an all-clear.
  $("flags").replaceChildren(...(flags.length
    ? flags.map(f => f.resolved ? card("resolved", t("flag.danger_asked_confirmed", { time: fmtTime(f.resolved_at) })) : card(f.level, t("flag." + f.code)))
    : [card("info", t("flags.none"))]));
}

async function approve() {
  const v = values();
  const bpMissing = RECORD.bp1_sys.value == null || RECORD.bp1_dia.value == null;
  const id = await store.add("records", { created_at: new Date().toISOString(), note: $("note").value, record: RECORD,
    flags: resolveFlags(checkProtocol(v)),
    danger_signs_asked: { confirmed: true, at: DANGER_AT }, raw_transcript: RAW,
    bp_not_measured: bpMissing ? { reason: $("bpReason").value, other: $("bpReasonOther").value.trim() || null } : null });
  await outbox.queue(outbox.remindersFor(id, v, P));
  RECORD = null; $("recordBox").hidden = true; $("note").value = ""; $("consent").checked = false; $("dangerAsked").checked = false; DANGER_AT = null;
  RAW = null; $("rawBox").hidden = true;
  $("bpNotMeasured").checked = false; $("bpReason").value = ""; $("bpReasonOther").value = ""; $("bpReasonRow").hidden = true;
  $("status").textContent = "";
  APPROVED = true; renderSteps();
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
      const exists = await Promise.all(codes.map(c => clipExists(P.packs.voice.voice[c]))); // in parallel
      const missing = codes.filter((c, i) => !exists[i]);
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
    return el("div", { textContent: `#${r.id} · ${new Date(r.created_at).toLocaleString(UI, { dateStyle: "short", timeStyle: "short" })} · ${v("patient_name")} · ${t("bp.short")} ${v("bp1_sys")}/${v("bp1_dia")}` });
  }) : [document.createTextNode(t("saved.none"))]));
}

function refreshLists() { renderOutbox(); renderSaved(); renderMissed(); renderNoorPhone(); renderSteps(); }

// Noor's shared basic phone (desktop: right-hand device): the latest reminders as she receives them.
async function renderNoorPhone() {
  const msgs = (await store.all("outbox"));
  const lastRec = msgs.length ? Math.max(...msgs.map(m => m.record_id)) : null;
  const mine = msgs.filter(m => m.record_id === lastRec);
  if (mine[0]) $("noorClock").textContent = mine[0].send_at.slice(11);
  $("noorInbox").replaceChildren(...(mine.length ? mine.map(m => {
    if (m.kind === "voice") {
      const b = el("button", { textContent: "▶ " + t("noor.play") });
      b.onclick = () => playSequence(outbox.clipCodes(m, P.packs.voice));
      return el("div", { className: "basic-msg" }, el("div", { className: "from", textContent: t("noor.voice") }), b);
    }
    const text = tSms(m.template, { ...m.params, weekday: tSms("weekday." + m.params.weekday) });
    return el("div", { className: "basic-msg" }, el("div", { className: "from", textContent: t("noor.sms") }), el("div", { textContent: text }));
  }) : [el("div", { className: "basic-empty", textContent: t("noor.empty") })]));
}

async function renderMissed() {
  const missed = missedFollowUps(await store.all("records"), today());
  $("missed").replaceChildren(...(missed.length ? missed.map(m => el("div", { className: "msg" },
    el("div", { textContent: `${m.name || "?"} · ${m.phone || ""}` }),
    el("div", { className: "meta", textContent: t("missed.due", { date: fmtDate(m.due) }) }))) : [document.createTextNode(t("missed.none"))]));
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(UI, { weekday: "long", day: "numeric", month: "long" });
}

// ---------- samples + speech service ----------
async function loadSamples() {
  let samples = [];
  try { samples = await (await fetch("samples/samples.json")).json(); } catch {}
  if (!samples.length) { $("samples").textContent = t("note.samples_none"); return; }
  $("samples").replaceChildren(...samples.map(s => {
    const b = el("button", { className: "secondary sample" },
      el("div", { textContent: (UI !== "fr" && s[`title_${UI}`]) || s.title }),
      el("div", { className: "sub", textContent: t("note.samples_label", { model: s.model }) }));
    b.onclick = () => {
      if (s.audio) new Audio(s.audio).play().catch(() => {});
      $("note").value = s.transcript; $("note").dataset.source = "speech";
      showRaw(s.transcript, t("note.samples_label", { model: s.model }), s.words);
    };
    return b;
  }));
}

let RAW = null; // last raw speech transcript (before any edit or extraction)
let LOWCONF = []; // words the speech model was unsure about (probability below the profile threshold)
function showRaw(text, label, words = null) {
  RAW = { text, label, words };
  LOWCONF = (words || []).filter(w => w.p < (P.asr_low_conf_threshold ?? 0.4)).map(w => w.w);
  $("rawBox").hidden = false;
  $("rawLabel").textContent = label + (LOWCONF.length ? " " + t("raw.lowconf_hint") : "");
  if (!text) { $("rawText").textContent = t("raw.empty"); return; }
  if (!words?.length) { $("rawText").textContent = `« ${text} »`; return; }
  // Low-confidence words are subtly highlighted; fields built from them are marked "please check".
  const th = P.asr_low_conf_threshold ?? 0.4;
  // no space before tokens that start with an apostrophe or hyphen ("C" + "'est" -> "C'est")
  $("rawText").replaceChildren("« ", ...words.flatMap((w, i) => [i && !/^['’-]/.test(w.w) ? " " : "",
    w.p < th ? el("mark", { className: "lowconf", textContent: w.w, title: t("raw.lowconf_word", { p: Math.round(w.p * 100) }) }) : w.w]), " »");
}

let ASR_MODE = "none";
async function probeSpeech() {
  // The hosted page never probes localhost (Chrome would show a local-network permission prompt).
  // ?asr=ondevice forces on-device mode (testing, or a local install without the speech service).
  const forceOndevice = new URLSearchParams(location.search).get("asr") === "ondevice";
  const hosted = isHostedLocation(location.hostname) || forceOndevice;
  let serviceUp = false;
  if (!hosted) try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 800);
    serviceUp = (await fetch(P.speech_service_url + "/health", { signal: ctl.signal })).ok;
  } catch {}
  ASR_MODE = selectAsrMode({ hosted, serviceUp, hasMic: !!navigator.mediaDevices?.getUserMedia,
    hasWorker: typeof Worker !== "undefined", hasAudio: typeof OfflineAudioContext !== "undefined",
    ondeviceEnabled: !!P.asr_ondevice?.enabled });
  $("speech").textContent = ASR_MODE === "service" ? t("speech.available")
    : ASR_MODE === "ondevice" ? t("speech.ondevice", { model: ondeviceModel().name }) : (hosted ? t("speech.hosted") : t("speech.unavailable"));
  $("btnMic").hidden = ASR_MODE === "none";
  $("btnMic").textContent = ASR_MODE === "ondevice" && !asrReady() ? t("speech.download", { mb: ondeviceModel().mb }) : t("speech.record");
}

// ---- on-device speech (beta): Whisper in a Web Worker ----
function ondeviceModel() {
  const c = P.asr_ondevice || {};
  const small = (navigator.deviceMemory ?? 8) < 4; // low-memory phone -> tiny
  return small ? { id: c.fallback_model, mb: c.fallback_size_mb, name: "whisper-tiny" } : { id: c.model, mb: c.size_mb, name: "whisper-base" };
}
const asrReady = () => { try { return localStorage.getItem("htn-asr-ready") === ondeviceModel().id; } catch { return false; } };
let WORKER = null;
function worker() {
  if (WORKER) return WORKER;
  WORKER = new Worker(new URL("./engine/asr-worker.js", import.meta.url), { type: "module" });
  const files = {};
  WORKER.addEventListener("message", ({ data }) => {
    if (data.type === "progress" && data.status === "progress" && data.total) {
      files[data.file] = [data.loaded, data.total];
      const [l, tot] = Object.values(files).reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
      $("dlBox").hidden = false;
      $("dlText").textContent = t("speech.downloading", { mb: (tot / 1e6).toFixed(0), done: (l / 1e6).toFixed(0) });
      $("dlBar").style.width = `${Math.round(100 * l / tot)}%`;
    }
    if (data.type === "ready") {
      $("dlBox").hidden = true;
      try { localStorage.setItem("htn-asr-ready", ondeviceModel().id); } catch {}
    }
  });
  return WORKER;
}
function ask(msg, transfer) {
  return new Promise((resolve, reject) => {
    const w = worker();
    const h = ({ data }) => {
      if (data.type === "error") { w.removeEventListener("message", h); reject(new Error(data.message)); }
      if ((msg.type === "load" && data.type === "ready") || (msg.type === "transcribe" && data.type === "result")) { w.removeEventListener("message", h); resolve(data); }
    };
    w.addEventListener("message", h);
    w.postMessage(msg, transfer || []);
  });
}
async function downloadModel() {
  $("btnMic").disabled = true; $("btnMic").textContent = t("speech.downloading_short");
  try { await ask({ type: "load", model: ondeviceModel().id }); $("speech").textContent = t("speech.ondevice", { model: ondeviceModel().name }); }
  catch { $("speech").textContent = t("speech.ondevice_failed"); $("dlBox").hidden = true; }
  $("btnMic").disabled = false; $("btnMic").textContent = asrReady() ? t("speech.record") : t("speech.download", { mb: ondeviceModel().mb });
}
// Recorded blob (webm/opus or mp4) -> 16 kHz mono Float32 for Whisper.
async function to16kMono(blob) {
  const ac = new AudioContext();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

// Live dictation: record in the browser, transcribe on the LOCAL service (audio never leaves the device).
let rec = null;
const TOO_QUIET_DBFS = -60; // loudest 50 ms frame below this = nothing usable was captured
async function toggleMic() {
  if (rec) { rec.stop(); return; }
  if (ASR_MODE === "ondevice" && !asrReady()) return downloadModel(); // one-time model download, with progress
  // Phone held at a distance: let the browser boost and clean the signal before recording.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true } });
  const chunks = [];
  const level = startMeter(stream);
  rec = new MediaRecorder(stream);
  rec.ondataavailable = e => chunks.push(e.data);
  const mime = rec.mimeType;
  rec.onstop = async () => {
    stream.getTracks().forEach(tr => tr.stop());
    const peakDb = level.stop();
    rec = null;
    if (peakDb < TOO_QUIET_DBFS) { $("speech").textContent = t("speech.too_quiet"); $("btnMic").textContent = t("speech.record"); return; }
    $("btnMic").textContent = t("speech.working"); $("btnMic").disabled = true;
    try {
      if (ASR_MODE === "ondevice") {
        const audio = await to16kMono(new Blob(chunks, { type: mime }));
        const j = await ask({ type: "transcribe", model: ondeviceModel().id, audio }, [audio.buffer]);
        showRaw(j.text, t("raw.ondevice", { model: ondeviceModel().name, s: j.proc_s, device: j.device }));
        if (j.text) { $("note").value = j.text; $("note").dataset.source = "speech-ondevice"; $("btnFill").click(); }
        $("speech").textContent = j.text ? t("speech.done", { s: j.proc_s }) : t("speech.empty");
        $("btnMic").textContent = t("speech.record"); $("btnMic").disabled = false;
        return;
      }
      const r = await fetch(P.speech_service_url + "/transcribe", { method: "POST", body: new Blob(chunks) });
      const j = await r.json();
      // Raw transcript is shown separately from the extracted record, so we can tell whether speech or
      // extraction failed. Then the record is filled automatically.
      showRaw(j.text ?? "", t("raw.live", { model: j.model ?? "?", s: j.proc_s ?? "?" }), j.words);
      if (j.text) { $("note").value = j.text; $("note").dataset.source = "speech"; $("btnFill").click(); }
      $("speech").textContent = j.text ? t("speech.done", { s: j.proc_s }) : t("speech.empty");
    } catch { $("speech").textContent = t("speech.unavailable"); }
    $("btnMic").textContent = t("speech.record"); $("btnMic").disabled = false;
  };
  rec.start();
  $("btnMic").textContent = t("speech.stop");
}

// Switch interface language; everything visible re-renders.
function setUI(l) {
  UI = l; t = makeT(P.packs.ui[l], P.packs.fallback);
  try { localStorage.setItem("htn-ui", l); } catch {}
  paintText(); paintNet();
  if (!$("pinGate").hidden) { $("pinLabel").textContent = pin.hasPin() ? t("pin.enter") : t("pin.set"); $("btnPin").textContent = t("pin.button"); }
  if (RECORD) renderRecord();
  refreshLists(); loadSamples(); probeSpeech();
}

// Small input-level meter while recording; returns the loudest 50 ms frame (dBFS) when stopped.
function startMeter(stream) {
  let peak = -Infinity, raf = 0, ctx = null;
  try {
    ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    $("meter").hidden = false;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const db = 10 * Math.log10(sum / buf.length + 1e-12);
      peak = Math.max(peak, db);
      $("meterBar").style.width = `${Math.max(0, Math.min(100, (db + 70) * 1.6))}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { peak = 0; } // no Web Audio: never block dictation on the meter
  return { stop() { cancelAnimationFrame(raf); ctx?.close(); $("meter").hidden = true; return peak; } };
}

// ---------- boot ----------
(async () => {
  P = await loadProfile();
  // Interface language: saved choice, else English on the hosted demo, else the worker locale.
  // Dictation, the extraction lexicon and the patient SMS stay in the profile's languages.
  const hosted = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let saved = null; try { saved = localStorage.getItem("htn-ui"); } catch {}
  UI = P.packs.ui[saved] ? saved : hosted && P.packs.ui[P.hosted_default_ui] ? P.hosted_default_ui : P.worker_locale;
  t = makeT(P.packs.ui[UI], P.packs.fallback);
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
    const src = $("note").dataset.source || "typed";
    const source = src === "speech-ondevice" ? "speech" : src;
    const lowConf = src === "speech" ? LOWCONF : [];
    try {
      RECORD = extract($("note").value, SCHEMA, LEX, { source, classifier: CLF, lowConf });
      // On-device mode has no word confidence: EVERY field derived from speech is "please check".
      if (src === "speech-ondevice") flagAllSpeechFields(RECORD, SCHEMA);
    } catch { RECORD = emptyRecord(SCHEMA); } // safe default: nothing pre-filled, everything "please check"
    RECORD.visit_date = { value: today(), confidence: 1, source: "typed", check: false };
    APPROVED = false;
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
