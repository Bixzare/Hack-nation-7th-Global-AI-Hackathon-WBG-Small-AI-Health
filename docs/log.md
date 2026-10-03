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

## Metrics (for the pitch)
| Metric | Value | How measured | Device |
|---|---|---|---|
| ASR model size | | | |
| ASR latency (per 10 s clip) | | | |
| ASR WER / number accuracy on own BP sentences | | | |
| Extractor size | | | |
| Extractor latency (median of 20) | | | |
| Field-level accuracy (held-out synthetic) | | | |
| BP-number extraction accuracy | | | |
| Urgent-flag recall (held-out synthetic) | | | |
| Works fully offline | | | |

## Later (out of scope this weekend)
- Cluster flag to a district health officer, where a human decides whether to alert
- Pre-recorded Kinyarwanda voice calls to patients (IVR)
- Native Android build with on-device ASR
- Real DHIS2 sync; other protocols (diabetes, antenatal care, IMCI)
