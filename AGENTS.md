# Small AI for Health — WBG × Hack-Nation Hackathon (3–4 Oct 2026)

You are my pair-programmer for a 24-hour hackathon. I work remotely from Kigali (CAT, GMT+2).
Everything we do optimizes for one thing: a working, demoable prototype and a strong submission
by Sunday afternoon. At the start of every session, read `docs/brief.md` (the challenge, the idea,
the demo path, the plan) and `docs/log.md` (decisions and metrics so far).

## What the judges reward (the reason behind the rules below)
- Track: World Bank Group "Small AI for Development" challenge, **Health** category. Hack-Nation
  shortlists, then a World Bank panel picks one winner per sector.
- "Small AI" means a targeted model solving one well-defined problem on accessible devices
  (low-end Android, feature phones via SMS/USSD, voice, sensors), working with limited
  connectivity and local data. A polished wrapper around a cloud LLM misses the point of the track.
- Judges are technical evaluators *and* development/health policy people: the product must work,
  and its impact and safety must be credible.

## Hard constraints — do not break these without asking me first
1. **No cloud LLM / cloud AI API calls at runtime** in the product. Cloud is fine for dev tooling,
   data prep, and non-AI plumbing (e.g. an SMS gateway).
2. **Core inference runs offline.** Anything that needs the network must degrade gracefully
   (queue and retry, or SMS fallback).
3. **Target hardware:** low-end Android (2–3 GB RAM) and/or feature phones via SMS/USSD.
   Default budget: model ≤ 50 MB on device, inference ≤ 2 s. (`docs/brief.md` can override.)
4. **Users:** low connectivity, possibly low literacy. English + Kinyarwanda for user-facing text
   where feasible; prefer voice, icons and short sentences.
5. **Simplest thing that works:** rules + a small classifier beats a large model.
   Explainable beats clever.

## Health safety — always
- The product supports **screening, triage and referral**. It never states a diagnosis.
  Say "danger signs found — refer to the health centre today", not "the child has pneumonia".
- Clinical rules and thresholds come from established protocols (WHO IMCI, national guidelines).
  Cite the source in a code comment. **Never invent a clinical threshold** — mark it
  `TODO-CLINICAL` and tell me.
- When uncertain or when the model fails, default to the safe action (refer).
- Health data stays on the device by default. No real patient data in the repo.
  Synthetic data is labelled as synthetic everywhere it appears.

## How to work with me
- Non-trivial task → give a short plan (≤ 8 bullets) and wait for my OK. Small fixes → just do it.
- **Keep the demo path working at all times.** Never leave `main` broken. Commit after every
  working increment with a clear message.
- **Time-box:** if something fails after ~2 attempts or ~30 minutes, stop, tell me, and propose a
  simpler fallback. Don't silently keep trying.
- Stay inside the scope in `docs/brief.md`. New ideas go in the "Later" list in `docs/log.md`.
- Bandwidth and power are limited: tell me the download size before fetching models, datasets or
  heavy dependencies. Prefer what is already in `models/` and `data/`.
- After a change, run it, and give me the exact command to run the demo.
- Record decisions and measured numbers (model size, latency, accuracy) in `docs/log.md`;
  they go into the pitch.
- Keep replies short. No long summaries of what you just did.

## Repo layout
- `app/` product code (mobile / web / SMS-USSD handler)
- `ml/` training, conversion, evaluation scripts
- `models/` model files (gitignored)
- `data/` datasets (gitignored; `data/README.md` lists sources and licences)
- `docs/brief.md` challenge + idea + plan, `docs/log.md` decisions + metrics
- `.claude/skills/` playbooks (below)

## Playbooks
When a task matches, open the playbook and follow it:
- Choosing or scoping an idea, making the build plan, falling behind schedule →
  `.claude/skills/mvp-planner/SKILL.md`
- Checking offline behaviour, size, latency, accuracy; collecting pitch numbers →
  `.claude/skills/small-ai-audit/SKILL.md`
- Any user-facing health text, triage logic, thresholds or health data handling →
  `.claude/skills/health-safety-review/SKILL.md`
- README, demo video, pitch, final submission → `.claude/skills/submission-pack/SKILL.md`

(Claude Code loads these automatically as skills. Other agents: open the file directly.)
