---
name: health-safety-review
description: Reviews and fixes anything clinical or user-facing in the health prototype — UI text, SMS/USSD/voice messages, triage rules, thresholds, model outputs shown to users, and health data handling. Use it whenever any of these are written or changed, before the demo, and before the video, even for small wording tweaks.
---

# Health safety review

World Bank health judges will look for responsible design. Weak safety framing can sink an
otherwise strong entry; strong framing sets us apart.

## Checklist (report each item with file:line and a proposed fix)

**Language**
- No diagnosis statements. Outputs are screening/triage results with a clear action
  ("Danger sign found: go to the health centre today").
- Urgency levels are explicit and consistent (e.g. urgent referral / refer / home care + follow-up).
- Plain words, short sentences, readable at low literacy.
- Kinyarwanda text is marked `NEEDS-NATIVE-CHECK` until a native speaker has reviewed it.

**Clinical grounding**
- Every rule and threshold cites its source (WHO IMCI, national guideline, paper) in a comment.
- Any threshold without a source is marked `TODO-CLINICAL` and reported to the user.
  Never invent or "reasonably guess" clinical numbers.

**Failure direction**
- Model uncertain, low-confidence, or failing → safe default is referral, never "all clear".
- Missing or invalid input → ask again or refer; never silently skip.

**Data**
- Health data stays on the device by default; only the minimum is sent (e.g. a referral SMS).
- No real patient data in the repo or demo. Synthetic data is labelled.
- A one-line consent/notice exists in the flow.

**Disclosure**
- README and pitch state: prototype, not clinically validated, designed to support — not
  replace — health workers.

## Output
Issues grouped as **must fix before demo** / **should fix** / **note in pitch**.
Apply trivial wording fixes directly; ask before changing logic or thresholds.
