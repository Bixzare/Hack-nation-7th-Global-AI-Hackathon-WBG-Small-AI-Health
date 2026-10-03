---
name: submission-pack
description: Produces the hackathon submission materials — README, demo video script and shot list, pitch outline, the "What does localizing AI development mean for you?" reflection, and the final submission checklist. Use from Sunday ~11:00 CAT onwards, or whenever the user mentions the video, pitch, README, judges, slides or submitting.
---

# Submission pack

Everything must be in English. Check the Hack-Nation platform for the exact video length and
submission fields, and fit to those. Pull every number from `docs/log.md` — never invent metrics.

## README.md
1. One-line pitch
2. Problem + user (one short paragraph, one or two sourced facts)
3. Demo (GIF/screenshot + link to the video)
4. How it works: architecture sketch, the model, where it runs, why it is *small AI*
5. Measured results (table from `docs/log.md`)
6. Safety & limitations (prototype, not clinically validated, referral-first design)
7. Run it: exact commands from a fresh clone
8. Data sources and licences; team

## Demo video (script + shot list)
1. **Hook (≈10 s)**: one sourced fact about the problem
2. **User & constraint (≈15 s)**: who, which device, what connectivity
3. **Live demo (≈60 s)**: the demo path, visibly offline (airplane mode on screen)
4. **How it works (≈30 s)**: model, size, latency, where it runs
5. **Impact & scale (≈20 s)**: reach, cost per user, fit with existing health systems
6. **Safety (≈10 s)**: referral-first, on-device data
7. **Close (≈10 s)**: next step (e.g. pilot with CHWs)
Write narration short enough to read calmly within the limit.

## Localizing AI reflection
Draft from the user's own notes and experience; keep their voice. Concrete over abstract:
a real user, a real language, a real constraint.

## Final checklist
- [ ] Demo runs from a fresh clone with the README commands
- [ ] No secrets or API keys in the repo (search for them)
- [ ] Repo visibility/link as required; video link opens in a private window
- [ ] All team members listed as registered
- [ ] Every claim in video/README has a number from `docs/log.md` or a source
- [ ] Submitted with at least 1 hour of buffer
