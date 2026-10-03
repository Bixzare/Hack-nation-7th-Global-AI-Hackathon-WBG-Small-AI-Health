---
name: mvp-planner
description: Turns the hackathon challenge and a raw idea into a scoped 24-hour build plan with one demo path, timed milestones and fallbacks. Use this at kickoff, when comparing ideas, when scope feels too big, when we are behind schedule, or whenever the user asks what to build or do next — even if they never say "plan".
---

# MVP planner

Goal: the smallest build that gives judges a convincing, working demo of small AI in health.
A finished narrow demo beats an unfinished ambitious one every time.

## 1. If choosing between ideas
Score each idea 1–5 on these criteria and show a table:
- **Small AI fit** — targeted model, runs offline on cheap devices, SMS/voice friendly
- **Buildable** — realistic in ~14 focused hours by a solo builder with AI tooling
- **Health impact** — clear user, clear problem, credible and sourced
- **Data** — a usable dataset exists and is already downloaded (or can be synthesised honestly)
- **Demo strength** — can be shown live, ideally in airplane mode, in under 60 seconds

Recommend one. Name the single biggest risk of the winner.

## 2. Define the demo path
3–6 concrete steps a judge will watch, from the user's action to the outcome
(e.g. CHW answers 5 voice prompts → model flags danger sign → app shows "refer today" → SMS queued).
Everything not on this path is optional.

## 3. Scope
- **Must**: only what the demo path needs
- **Should**: nice-to-haves, done only after milestone M2
- **Won't**: write them down so we stop thinking about them

## 4. Milestones (CAT, adjust to the confirmed kickoff)
- M0 +2 h: repo skeleton runs, "hello" end-to-end
- M1 +5 h: full demo path works with a **stubbed** model (hard-coded or rule-based output)
- M2 Sat night: real model in the loop
- Sleep ~01:00–06:00. Not optional.
- M3 Sun 11:00: feature freeze
- M4 Sun 11:00–14:00: submission assets; submit by 14:00

## 5. Fallbacks
For every risky component, name the fallback before starting it:
- Model accuracy poor → rules from the clinical protocol + tiny classifier for one signal
- Speech recognition poor in Kinyarwanda → tap/keypad input with recorded voice prompts
- Phone deployment fails → run on laptop in airplane mode, show size/latency numbers
- SMS gateway fails → gateway simulator/sandbox screenshots

## 6. When behind schedule
Cut in this order: Should items → polish → second language → live device deployment.
Never cut: the working demo path, the offline proof, the safety wording.

Write the result into `docs/brief.md` (Demo path, Scope, Plan) and log the decision in `docs/log.md`.
