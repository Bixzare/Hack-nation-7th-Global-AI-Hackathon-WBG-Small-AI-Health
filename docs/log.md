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

## Metrics (for the pitch)
| Metric | Value | How measured | Device |
|---|---|---|---|
| ASR model size | | | |
| ASR latency (per 10 s clip) | | | |
| ASR WER / BP-number accuracy (gold clips) | | | |
| Extractor size | | | |
| Extractor latency (median of 20) | | | |
| Field accuracy, typed→record (gold) | | | |
| Field accuracy, speech→record (gold) | | | |
| BP-number extraction accuracy | | | |
| Urgent-flag recall (held-out synthetic) | | | |
| Works fully offline | | | |

## Later (out of scope this weekend)
- Cluster flag to a district health officer, where a human decides whether to alert
- IVR calls playing the Zarma clips
- Zarma–French data (Feriji, licence permitting) and Zarma ASR
- Native Android build with on-device ASR (whisper.cpp)
- Real DHIS2 sync; other protocols (diabetes, antenatal care, IMCI)
