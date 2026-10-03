---
name: small-ai-audit
description: Audits the prototype against the "Small AI" criteria (offline, small, fast, cheap device) and collects the measured numbers for the pitch. Use after the model is integrated, before feature freeze, before recording the video, and whenever the user asks whether something counts as small AI or wants metrics, benchmarks, size, latency or accuracy.
---

# Small AI audit

Judges need proof, not claims. Produce a pass/fail checklist and real numbers.

## 1. Runtime network calls
Search the product code (`app/`, and anything it imports from `ml/`) for network use:
HTTP clients, `openai`, `anthropic`, `googleapis`, hosted inference URLs, API keys.
List each one and classify it: **dev-only** (fine), **non-AI plumbing** such as an SMS gateway
(fine if it degrades gracefully), or **runtime AI call** (fail — propose an on-device replacement).

## 2. Offline proof
Give the exact steps to run the demo path with networking disabled, and run it if possible.
Note what happens to anything network-dependent (it should queue or fall back, not crash).

## 3. Measurements
- **Model size** on disk (MB), including tokenizer/labels
- **Latency**: median and p90 over 20 runs, after one warm-up run; state the device
- **Memory**: approximate peak RAM during inference if measurable
- **Accuracy** on a held-out set never used for training: sensitivity, specificity and a
  confusion matrix; state the data source and whether it is synthetic. For danger-sign
  detection, sensitivity matters most — say so.
- **Reach/cost**: minimum device required, and per-user running cost (e.g. SMS cost) if any

Write a small reusable script in `ml/measure.py` if one doesn't exist, rather than timing by hand.

## 4. Output
- Checklist: offline ✅/❌, size budget ✅/❌, latency budget ✅/❌, no runtime cloud AI ✅/❌
- Update the Metrics table in `docs/log.md`
- Ranked list of fixes, cheapest first. Don't start fixing until the user agrees.
