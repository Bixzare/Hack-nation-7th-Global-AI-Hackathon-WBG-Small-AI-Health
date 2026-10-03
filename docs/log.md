# Log

## Decisions
- Sat ~19:30: The concept is offline voice-to-record. A spoken visit becomes a fixed record, protocol
  gaps are flagged, the health worker approves, and the approved record triggers an SMS to the
  patient. Why: the AI-made record is what triggers the notifications, so the SMS layer depends on
  the model rather than being a standalone feature (as in Mwana).
- Sat 19:30: **Switched from IMCI (sick child) to adult hypertension follow-up (WHO HEARTS) at the
  clinic.** Why: the challenge PDF makes Noor (38) the patient at an overcrowded clinic, and its pain
  points are record-keeping burden, outdated guidance and continuity of care. HEARTS has simple
  published rules and a natural follow-up SMS.
- Sat ~19:30: The extractor is rules plus a tiny classifier, with no on-device LLM. Why: a small LLM
  is ≥ 300 MB and weak in Kinyarwanda, while rules are explainable and fit the PDF's "fixed list of
  answers" guardrail.
- Sat ~19:30: Patient SMS carries no clinical content (shared phone), and is sent in the evening
  (her phone is at the house by day).
- Sat ~19:30: Protocol checks are deterministic rules, not AI, so they are checkable and cannot
  hallucinate.
- Sat ~19:30: Outbreak / cluster alerts are pitch-only.
- Sat ~19:45: BP values are typed numeric fields. Any number from speech recognition is always
  marked "please check". Why: a misheard BP is the most dangerous error a voice tool can make.
- Sat ~19:45: Added a hand-written gold test set (30–40 narratives with negation, hedging and
  code-switching), kept separate from the synthetic training data. Rules vs classifier are reported
  on it. Why: testing on our own generated data would overstate accuracy.
- Sat ~19:45: Encryption at rest is claimed only if implemented. The PIN gate is in Tier 1.
- Sat ~19:45: M2 option: a JavaScript port of the extractor and rules, run in airplane mode in the
  Android browser. Otherwise the laptop is framed as the health-centre device.

- Sat 20:05: The speech model was never downloaded, so we are text-first for M0 and the S0
  decision is due by M1b (23:59). Kinyarwanda ASR candidates (sizes from the HF API):
  - w2v-bert-2.0 rw ONNX int8 (OpenVoiceOS), 584 MB, CC-BY-4.0, onnxruntime only (no torch)
  - DigitalUmuganda/mbaza_stt_health_domain (renamed from afrivoice_..._health_domain_stt),
    NeMo, 463 MB, licence not stated
  - mbazaNLP Coqui STT, TFLite 47 MB + 65 MB scorer, Apache-2.0, needs Python <= 3.10
  - DigitalUmuganda parakeet-tdt_ctc-110m, NeMo, 453 MB, gated
  - Whisper-small and XLS-R fine-tunes, 1-1.3 GB, torch
- Sat 20:05: M0 done (commit 9b46c60). The challenge PDF is gitignored (marked "Official Use Only").

- Sat 20:10: **Relocalized to a rural health centre (CSI) in Niger, and cancelled the Kinyarwanda
  speech-model search.** The worker side is French (short clinical notes); the patient side is
  **Zarma by voice only**.
  Why: Zarma has no usable open speech recognition and low written literacy, which makes it the
  PDF's "less-supported language" case. Recorded human voice is the safe answer; a weak model is not.
  Dropped the Zarma text SMS and the Zarma reply classifier, since text can't reach Noor.
- Sat 20:10: Locale packs are `fr` (worker), `dje` (patient voice clips only) and `en` (fallback).
  The engine and rules emit codes only, and one config value selects the profile.
  Why: replicability is scored, and a new country should mean a new pack, not new code.
- Sat 20:10: The gold test set is now ~30 audio clips of my French dictation plus a CSV of fields.
  It measures speech→record and typed→record end to end.
  Why: it measures the whole pipeline, not just the extractor.
- Sat 20:10: S0 is French Whisper tiny or base, offline. Sizes:
  - faster-whisper tiny: 76 MB
  - faster-whisper base: 145 MB
  - whisper.cpp tiny-q5_1: 32 MB
  - whisper.cpp base-q5_1: 60 MB
  All MIT. Nothing downloaded yet.
- Sat 20:10: Feriji (27Group/Feriji) is CC-BY-NC-4.0 and gated, so it is next steps only.
- Sat 20:10: **Architecture: a static front-end.** The extractor, rules, PIN gate, outbox and
  IndexedDB all run in the browser, with a service worker for offline use, and the app is hosted.
  Python is only for training/export and a local Whisper service. The FastAPI M0 is replaced.
  Why: a clickable hosted demo is required, running in the browser is the honest "on device" story,
  and the planned JS port at M2 becomes the architecture, freeing M2 for the classifier and eval.
- Sat 20:10: The PIN gate is an access gate, not encryption. We won't claim encryption unless it is built.

### Overnight run (Sat 22:15 →)
- **Recordings integrated.**
  - Gold: `fr-N.mp3` maps to the CSV's `fr_NN.wav`. Converted to 16 kHz mono WAV in `data/gold/clean/`.
  - Noisy copies: 15 even-numbered clips (`data/gold/noisy/`) at 10 dB SNR, rotating fan, street and
    chatter noise (`data/gold/manifest.csv`). All noise is synthetic: pink noise + 100 Hz hum; brown
    noise + horns; reversed babble of other gold clips. Originals are kept.
  - Zarma clips were in `locales/dje/` (not `locales/dje/audio/`), named `dje_*.mp3`, with Monday as
    `dji_mon.mp3`. All mapped to `app/web/audio/dje/<code>.mp3`.
- **Schema aligned to gold-label conventions.** 4 symptoms (present / absent / uncertain /
  not_mentioned), missed_doses incl. "sometimes", follow-up as an interval (stored as an ISO duration,
  e.g. P2W), a referral field, and visit_date. "Uncertain" is always "please check".
- **HEARTS thresholds verified** against the PDFs (WHO/NMH/NVI/18.2, 2018; WHO 2021 guideline):
  - raised ≥140/90;
  - two readings at the first measurement, use the second;
  - confirmed on two different days;
  - urgent: >180/110 with severe headache, chest pain, shortness of breath or blurred vision;
  - urgent: >200/120, new chest pain, heart-failure signs, recently worsening vision;
  - refer: under 40 with ≥140/90, or pregnant with hypertension;
  - no ACE inhibitors, ARBs or thiazides for women of childbearing age;
  - follow-up monthly until at target, then every 3–6 months.
  Page refs for the urgent criteria are pp. 36–37. The 15–49 age range is the standard WHO
  reproductive-age definition (not re-fetched).
- **Gold protocol.**
  - Extractor v1 was committed (`bcc26f3`) *before* any gold number was computed.
  - Post-hoc changes: v2 used label-level confusions only; v3 used stem-count probes (counts, no
    wording).
  - At ~22:35 a tool notification displayed the 4 hosted-sample transcripts (gold ids 1, 4, 13, 20),
    so those 4 are "seen". `--unseen` reports the other 26. No lexicon change was made from them.
- **S0 decision: Whisper base, no prompt, as the health-centre-laptop speech model.** Voice-first is
  viable, with typing always available. The vocabulary prompt helped tiny but hurt base. Small is
  being tested (below).
- **The classifier doesn't help on gold.** Gold errors are missed mentions (vocabulary / ASR
  spelling), which the classifier can't see. It is kept: 113 KB, slightly better uncertainty
  surfacing on noisy text. Rules-only and rules + classifier are both reported.
- **Safety net.** HEARTS: "Screen each patient for danger signs". Any danger symptom left
  "not_mentioned" raises "ask about danger signs" (urgent if BP >180/110). It catches every missed
  and uncertain symptom on gold, but it fires on most notes, so it's a weak signal; say so in the pitch.
- **Reminder timing.** Sent in the evening 1 day before the visit (profile `reminder_days_before`,
  1–2), so "this coming [day]" is correct. Not sent when the patient is referred.

## Metrics (for the pitch)
Gold = 30 SYNTHETIC TTS clips (3 male voices). "Unseen" = 26 clips whose wording was never displayed.
Speech→record uses the extractor as of `4445cad` (lexicon v3).

| Metric | Value | How measured | Device |
|---|---|---|---|
| ASR model size | Whisper base int8 148 MB (tiny 78 MB) | on-disk CTranslate2 model | laptop |
| ASR speed | base: RTF 0.28 clean / 0.30 noisy (10 s clip ≈ 2.8 s); tiny 0.19 / 0.29; service: 7.6 s clip in 1.85 s | 30 clean + 15 noisy clips, CPU int8 | laptop CPU (no GPU) |
| Extractor + rules + classifier size | 146 KB (lexicon 10 KB, classifier 113 KB) | file sizes | browser |
| Extractor latency | 0.27 ms per note | median of 20, Node | laptop |
| Whole web app (incl. Zarma clips + 4 samples) | 1.1 MB | `du app/web` | browser |
| Field accuracy, speech→record, base, CLEAN | v1 82.6% → v3 **85.7%** (unseen-26: 85.7%) | 14 fields × 30 clips | laptop |
| Field accuracy, speech→record, base, NOISY | v1 75.2% → v3 **79.5%** (unseen: 78.0%) | 15 noisy clips, 10 dB SNR | laptop |
| Field accuracy, tiny clean / noisy | v1 75.7 / 69.0 → v3 81.0 / 73.3% | same | laptop |
| Rules vs rules + classifier (gold base clean) | 85.7% vs 85.7% (no gain) | same | |
| Dev (synthetic, same generator as lexicon: circular) | 99.7%; with simulated ASR typos 94.0% (rules + clf 94.1%) | 300 notes | |
| BP1 exact (base clean / noisy) | 83% / 53% (all speech BP is "please check" anyway) | gold | |
| Danger symptom present → marked ABSENT (false reassurance) | **0** of 15 (clean), 0 of 9 (noisy) | gold, base | |
| Danger symptom present → missed (not_mentioned) | 11 of 15 clean before v3; headache recall is the weak point (ASR spells "céphalées" phonetically) | gold, base | |
| Urgent-flag recall (HEARTS on extracted vs gold record) | base clean 5/6 (83%), noisy 3/4, tiny clean 6/6; false urgent 2/24 (base) | `ml/eval_flags.mjs` | |
| Uncertain symptoms surfaced (field or flag) | 3/3 clean, 2/2 noisy | gold | |
| Typed→record (gold) | **not measured: RECORDING-SCRIPT.md missing** | | |
| Works fully offline | yes: SW cache, offline reload passes; speech service on 127.0.0.1 | `ml/smoke_test.mjs` (headless Chrome) | laptop |

## Questions for morning
1. **RECORDING-SCRIPT.md is missing.** I couldn't find it in the repo, Downloads, Desktop or
   Documents. Without it there is no typed→record evaluation and no ASR WER. Where is it?
2. **May I split the gold set** into gold-dev (10 clips, used for error analysis) and gold-test
   (20, frozen)? Headache recall is ASR-limited ("céphalées" is transcribed phonetically), and
   fixing it properly needs to look at the wording. Alternative: keep gold frozen and report the
   limitation.
3. **Voice split:** which clips use which of the 3 male voices? It's needed for the data table and
   per-voice results.
4. **Whisper small (486 MB):** downloaded overnight (under your 500 MB limit) to test whether it
   fixes "céphalées". Result below. If it's better, is the laptop budget acceptable?
5. **Deploy:** still waiting for a yes to create a public GitHub repo (`gh` is logged in as Bixzare)
   or for you to connect Vercel. Nothing has been deployed.
6. **Classifier:** keep it (113 KB, no gold gain) or ship rules only? The brief's fallback says rules
   only if it's no better. I kept it because it surfaces more uncertainty on noisy text.

## Later (out of scope this weekend)
- Cluster flag to a district health officer, where a human decides whether to alert
- IVR calls playing the Zarma clips
- Zarma–French data (Feriji, licence permitting) and Zarma ASR
- Native Android build with on-device ASR (whisper.cpp)
- Real DHIS2 sync; other protocols (diabetes, antenatal care, IMCI)
