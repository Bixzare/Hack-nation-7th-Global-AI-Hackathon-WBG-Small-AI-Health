# Brief

Source: `docs/challenge-brief.pdf` (WBG × Hack-Nation, Small AI for Development, Annex A: Health).

## Challenge statement (condensed from the PDF)
- **Scenario:** Noor is 38 and farms in the highlands. Her household shares two phones: her basic
  phone (calls, SMS, mobile money) and her daughter's smartphone, which is only home at weekends.
  There is no Wi-Fi, only 3G bundles bought when needed. By day she is on the slope and **her phone
  stays at the house**. Her nearby clinic is overcrowded, its clinicians are "not always up to date
  with the latest medical guidance", and "burdensome record-keeping" means they can't give each
  patient the attention she needs.
- **Challenge:** "Design and demonstrate a Small AI solution that improves one meaningful part of
  Noor's access to primary care or a frontline worker's ability to serve her; for example screening
  support, **documentation**, referral, **follow-up or continuity of care**."
- **Rules:** runs on a device the user already has; the core feature works offline; model files are
  small enough to side-load or send over a weak link; at least one interaction is in a named local
  language. Expect the question: "how would it fare in a less-supported language?"
- **Guardrails:** a person makes the final call. The tool informs a decision and flags what it is
  unsure of ("not sure, ask a person"). It does not act on the user's behalf or hallucinate.
  The glossary adds a "fixed list of answers": a tool that can say anything cannot be checked for safety.
- **Health limits:** no imaging or diagnosis interpretation ("out of bounds"). We must state where
  the data sits, who can read it, and what happens when the phone is lost or shared.
- **Prior tools to beat:** Mwana and mTrac. Both were SMS-only (results, reminders, reporting) with
  no AI. Judges will ask: "would SMS, a spreadsheet or a search do the same job?"
- **Data rules:** name every dataset with its source, licence and size, **and state what our data does
  not cover (this is scored)**. Label synthetic data. Cite problem evidence with source, year and country.
- **Judging:** built solution 25%, development relevance and impact 20%, scalability / what's next
  10%. Data grounding, evidence it works, clarity / design / inclusivity, and value proposition for AI
  share the remaining 45% (the PDF's table is garbled; three of these are 15% each).
  **Responsible AI, data and safety is pass/fail.**
- **Deliverables:** the prototype with its code, plus a **2–5 min video (mandatory)** covering:
  - a one-sentence problem statement: "Because of this tool, [user] will [action] by [when] that
    they would otherwise [...]; we know because [evidence]"
  - the AI capabilities, why a simpler tool would not do, and the guardrails
  - an end-to-end demo
  - where the tool sits in the user's day, plus the tech stack
  - "what localizing AI means to me"
- **Dates:** competition 3–4 Oct. Shortlist 5–6 Oct. Seoul Ignite Talk 21 Oct.
  The submission deadline time is not in the PDF; **confirm it on Hack-Nation**.

## Problem (one sentence, in the video's required form, draft)
Because of this tool, the health worker at Noor's clinic will finish a complete, protocol-checked
hypertension visit record **before Noor leaves the room**, a record they would otherwise write late,
incompletely, or not at all. Noor will get a reminder for her next check on the phone at her house.
We know because: TODO, sourced evidence on guideline adherence (World Bank SDI) and the hypertension
burden (WHO).

## User
- **Primary:** the nurse or clinician at an overcrowded rural health centre in Rwanda. They have a
  low-end Android phone (2–3 GB RAM) and intermittent 3G. They speak Kinyarwanda, often mixed with
  French or English medical terms.
- **Secondary:** Noor, the patient. She has a shared basic phone kept at the house, uses SMS only,
  and has low digital literacy. Kinyarwanda.
- **Why Rwanda:** the scenario's place (Ondera) is fictional. We localize to rural Rwanda because I
  work from Kigali and Kinyarwanda has open speech data (Common Voice).

## Demo path (laptop in airplane mode, phone-sized UI, under 90 s)
1. After measuring Noor's blood pressure, the health worker **speaks** (or types) the visit in
   Kinyarwanda, e.g. "Noor, imyaka 38, umuvuduko w'amaraso 162 kuri 98, ababara umutwe, yibagirwa
   imiti rimwe na rimwe..." (Noor, 38, blood pressure 162 over 98, has headaches, sometimes forgets
   her medicine). `NEEDS-NATIVE-CHECK`
2. The on-device model fills a **fixed record**: BP readings, symptoms (present / absent / not
   asked), current medicine and missed doses, pregnancy status, counselling given, follow-up date,
   and action taken. **BP readings are typed numeric fields.** A number the AI pulls from speech
   only pre-fills the field and is **always** marked "please check" until the health worker
   confirms or types it.
3. Fields the model is unsure of are **highlighted** ("not sure, please check"). **Protocol-gap
   flags** come from WHO HEARTS rules, e.g.:
   - "BP is high on a single reading. HEARTS says to repeat the measurement."
   - "No follow-up date set."
   - "Woman of reproductive age: pregnancy status not recorded (affects medicine choice)."
   - If the BP is very high **and** urgent symptoms are present: "Urgent: ask a clinician / refer today."
4. The health worker fixes the fields and taps **Approve**. The record is saved on the device
   behind a PIN gate.
5. The approved record **queues an SMS** for Noor, sent in the evening when her phone is at home:
   "Muraho Noor, your next visit at [clinic] is on Tuesday 14 Oct." The message has no clinical
   content. It waits in the outbox until there is signal (simulated). Noor's YEGO/OYA (yes/no)
   reply is logged. If she misses the visit, the health worker's list shows "Noor has not returned",
   and a person decides what to do.

## The small AI component (and why a simpler tool won't do)
- **Task:** turn a spoken or typed visit narrative, which mixes Kinyarwanda with medical terms and
  numbers, into a fixed structured record with a confidence score for each field.
- **Why AI:** a form or spreadsheet *could* capture the same fields, but filling it is the
  record-keeping burden that steals patient time. SMS-only tools (Mwana, mTrac) move data; they
  can't create it from a conversation. The AI part is speech recognition plus information extraction
  in a local language. The protocol checks are deliberately **not** AI: they are rules with cited
  sources, so they are checkable and cannot hallucinate.
- **Model / approach (simplest first):**
  - **Speech recognition:** a Kinyarwanda model, **chosen by the S0 spike**. Whisper doesn't support
    Kinyarwanda. Candidates (verify their sizes before downloading): NeMo Conformer rw, XLS-R / MMS
    fine-tunes, Digital Umuganda models.
  - **Extractor:** a Kinyarwanda / English / French keyword lexicon, regular expressions for numbers
    ("162 kuri 98", "162 over 98"), and a **tiny classifier** (char n-gram logistic regression,
    < 5 MB) that decides whether each symptom or adherence phrase is present, absent or denied.
  - **Fail-safe:** if a field is below the confidence threshold or missing, it is marked "not sure,
    please check" and cannot be silently approved. **Any number that came from speech recognition
    is always marked "please check", whatever its confidence.** If speech recognition fails, the
    worker types.
- **Runs where:** the extractor and rules on the phone (≤ 5 MB, ≤ 200 ms; the JS port is an M2
  option). Speech recognition on
  the phone if the spike allows; otherwise on a health-centre laptop or tablet (budget override,
  decided at S0).
- **Output space is fixed:** record fields, flag texts and SMS templates are all closed lists. The
  tool never generates free text for the patient.

## Clinical grounding (verify every number before it goes into code)
- WHO HEARTS technical package: *Evidence-based treatment protocols* (2018) and the WHO guideline
  on pharmacological treatment of hypertension in adults (2021). Covers the thresholds for raised
  BP, the repeat-measurement rule, the urgent-referral criteria (very high BP with symptoms),
  follow-up intervals, and the pregnancy caution.
- Rwanda national NCD guidelines, if they can be found quickly.
- Any number not traced to one of these is marked `TODO-CLINICAL`.

## Data
| Dataset | Use | Licence | Size | Real / synthetic |
|---|---|---|---|---|
| Synthetic HTN visit narratives (rw / en) | train extractor (+ dev split) | ours | ~500–1000 lines | **SYNTHETIC** |
| **Gold test set**: 30–40 hand-written narratives | **test only**, never trained on | ours | 30–40 lines | hand-written, **SYNTHETIC** (not real patients) |
| Mozilla Common Voice, Kinyarwanda (a few clips) | ASR spike test | CC0 | < 50 MB sample | real |
| FLEURS | ASR benchmark, **if rw is included (check)** | CC-BY | sample | real |
| World Bank SDI, WHO GHO, Rwanda STEPS survey | problem evidence | open | n/a | real |
| DHIS2 docs / demo (hypertension tracker) | record export format | BSD / open | n/a | n/a |

**Gold test set:** written by hand, separate from the generated training data, and frozen before
the classifier is trained. It deliberately includes:
- negation: "nta mutwe umurya" / "no headache"
- hedging: "wenda", "maybe", "sometimes forgets"
- code-switching: Kinyarwanda + French / English terms
- spoken-style numbers: "ijana na mirongo itandatu na kabiri" (one hundred and sixty-two)
- missing fields

We report **rules-only vs rules + classifier** per field on this set.
All Kinyarwanda here is `NEEDS-NATIVE-CHECK`.

**What our data does not cover (for the video):**
- Real clinic audio: noise, overlapping speech, code-switching, older or rural accents.
- Real phrasing by health workers, since the synthetic narratives encode our own assumptions.
- Dialects other than Kigali's.
- Non-hypertension visits.

## Data handling (pass/fail answers)
- **Where it sits:** a local database on the health worker's device. Nothing leaves the device
  except the SMS, which has no clinical content.
- **Who can read it:** the health worker, behind a **PIN gate (built in Tier 1)**. Sync to DHIS2 is
  a "next step", not built.
- **Lost phone:** the app is PIN-gated. Encryption at rest is **claimed only if implemented and
  tested**; otherwise the pitch says "next step: encrypted storage" (Should, only if time allows).
- **Shared phone (Noor's):** her SMS only says *when* and *where* to come, never why or what was found.
- **Consent:** a one-line verbal consent checkbox at the start of the visit.

## Scope
- **Must (Tier 1):**
  - voice or typed input → fixed HTN record
  - low-confidence fields flagged ("not sure")
  - HEARTS protocol-gap flags, including urgent-referral signposting
  - the health worker approves
  - saved offline behind a PIN gate
  - gold test set (30–40 narratives) with a rules-vs-classifier report
- **Should (Tier 2, only after M2):**
  - SMS triggered by the record (follow-up / refill / referral), Kinyarwanda templates, no clinical content
  - store-and-forward outbox, evening send window, gateway simulator
  - log of YEGO/OYA replies
  - list of patients who missed follow-up
- **Stretch (Tier 3, only if ahead at 09:00 Sun):**
  - export the approved record as a DHIS2 tracker event (JSON), as proof of institutional fit
  - a small clinic dashboard (BP control rate, missed follow-ups)
- **Won't (this weekend):**
  - outbreak / cluster alerts
  - IVR voice calls
  - a native Android build
  - a real SMS gateway
  - other conditions (diabetes, IMCI)
  - real DHIS2 sync
  - medicine dosing advice (stays with the clinician)

## Plan (CAT; kickoff ~17:00 Sat; **submission time TO CONFIRM on Hack-Nation**, assumed 15:00 Sun)
- S0 ASR spike, 45 min hard stop ........ Sat 19:45–20:30
  - **First test the already-downloaded `models/kin-health-stt`.** Only if it fails, shortlist
    other candidates and report their sizes before downloading.
  - Test on 10 Common Voice rw clips plus own recordings, including **spoken numbers**
    ("ijana na mirongo itandatu na kabiri kuri mirongo cyenda n'umunani", i.e. 162 over 98) and
    keyword sentences.
  - Measure WER, BP-number accuracy, size, and the real-time factor.
  - Go voice-first if keywords come out usable at ≤ 2× real time on a laptop CPU. Numbers are
    flagged "please check" either way. Otherwise go text-first, with voice as the next step.
- M0 skeleton runs ...................... Sat 21:00 (git init, local web app, text → stub record → save)
- M1 Tier 1 with rule-based extractor .. Sat 23:30 (whole demo path on typed input)
- **M1b backup demo video ............... Sat 23:59** (screen recording of Tier 1 in airplane mode)
- M2 classifier + ASR in the loop ...... Sun 01:30
  - **Option, if M2 lands early:** port the extractor and rules to JavaScript, with the classifier
    weights exported as JSON. Run the demo in **airplane mode in my Android phone's browser**
    (an offline page served from the device).
  - Otherwise frame the laptop as the health-centre device and show the extractor's size and
    latency numbers.
- sleep ................................ Sun 01:30–06:30
- Tier 2 SMS + outbox + replies ........ Sun 06:30–09:00
- Eval + safety review + Kinyarwanda ... Sun 09:00–11:30
  - gold-set field accuracy (rules vs classifier), number-extraction accuracy, size, latency
  - /health-safety-review
- M3 feature freeze .................... Sun 11:30
- M4 video (2–5 min, 5 required parts) + README + pitch ... Sun 11:30–14:00
- SUBMIT ............................... Sun 14:00 (1 h buffer)

## Fallbacks
- Kinyarwanda speech recognition too big or too poor → typed input; voice shown as the next step
  with the spike numbers.
- Speech recognition fits only on a laptop → frame it as a health-centre device. The phone-side
  extractor stays tiny, with sizes measured.
- Classifier no better than rules → ship the rules and report both numbers honestly.
- Behind schedule → cut Tier 3, then the missed-follow-up list, then SMS replies, then Kinyarwanda UI polish.
  Never cut: Tier 1, the offline proof, the "not sure" fail-safe, the safety wording.

## Pitch prep
- **"Less-supported language?"** The extractor is a lexicon plus a classifier trained on a few
  hundred example sentences, so it can be rebuilt for a new language in days. Typed input works
  without speech recognition. Our recordings can go back to Common Voice.
- **"Why not SMS only?"** Mwana and mTrac moved existing data. We create the record from the
  conversation and check it against the protocol.
- **Scale:** the same engine works with a different protocol (diabetes, antenatal care, IMCI). The
  record can export to DHIS2, which ministries in 70+ countries already use.

## Sourced facts for the pitch
- TODO, World Bank SDI: provider adherence to clinical guidelines (country, year).
- TODO, WHO Global report on hypertension (2023): prevalence and control gap, Rwanda / Africa.
- TODO, Rwanda STEPS NCD survey: hypertension prevalence and awareness.
- TODO, GSMA Mobile Gender Gap: basic phone vs smartphone ownership, women, Rwanda.
