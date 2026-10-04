# Brief: Movois

*Speak the visit. Reach the patient.* Product name: **Movois** (médecine + voix).

Source: `docs/challenge-brief.pdf` (WBG × Hack-Nation, Small AI for Development, Annex A: Health;
gitignored because it is marked "Official Use Only").

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
  small enough to side-load or send over a weak link; at least one interaction is in a **named local
  language**. Expect the question: "how would it fare in a less-supported language?"
- **Guardrails:** a person makes the final call. The tool informs a decision and flags what it is
  unsure of ("not sure, ask a person"). It does not act on the user's behalf or hallucinate.
  The glossary adds a "fixed list of answers": a tool that can say anything cannot be checked for safety.
- **Health limits:** no imaging or diagnosis interpretation. We must state where the data sits, who
  can read it, and what happens when the phone is lost or shared.
- **Prior tools to beat:** Mwana and mTrac. Both were SMS-only with no AI. Judges will ask: "would
  SMS, a spreadsheet or a search do the same job?"
- **Data rules:** name every dataset with its source, licence and size, **and state what our data does
  not cover (this is scored)**. Label synthetic data. Cite problem evidence with source, year and country.
- **Judging:** built solution 25%, development relevance and impact 20%, scalability / what's next
  10%. Data grounding, evidence it works, clarity / design / inclusivity, and value proposition for AI
  share the remaining 45% (the PDF's table is garbled). **Responsible AI, data and safety is pass/fail.**
- **Deliverables:** the prototype (code + **a clickable hosted demo**) plus a **2–5 min video
  (mandatory)** covering:
  - a one-sentence problem statement: "Because of this tool, [user] will [action] by [when] that
    they would otherwise [...]; we know because [evidence]"
  - the AI capabilities, why a simpler tool would not do, and the guardrails
  - an end-to-end demo
  - where the tool sits in the user's day, plus the tech stack
  - "what localizing AI means to me"
- **Dates:** competition 3–4 Oct. Shortlist 5–6 Oct. Seoul Ignite Talk 21 Oct.
  The submission deadline time is not in the PDF; **confirm it on Hack-Nation**.

## Problem (one sentence, in the video's required form, draft)
Because of this tool, the nurse at Noor's rural health centre in Niger will finish a complete,
protocol-checked hypertension visit record **before Noor leaves the room**, a record they would
otherwise write late, incompletely, or not at all. That evening, Noor will **hear a reminder of her
next visit in Zarma** on the phone at her house, where she would otherwise get nothing, or a text
she can't read. We know because: TODO (Niger evidence, see below).

## User
- **Setting:** a rural primary health centre (CSI, *centre de santé intégré*) in Niger.
- **Primary user:** the nurse or health worker at the centre. They write notes in **French**, short
  and clinical in style ("F 38 ans, TA 162/98, céphalées, pas de DT, oublie parfois son ttt").
  They have a low-end Android phone or the centre's laptop, with intermittent 3G.
- **Secondary user:** Noor, the patient. She speaks **Zarma**, has limited written literacy, and has
  a shared basic phone kept at the house. **Patient-side interaction is by voice only.**
- **Why Niger and Zarma:** Zarma is a less-supported language (no usable open speech recognition,
  low written literacy). That is exactly the PDF's question. We answer it with recorded human voice,
  not with a model we can't trust.

## Localization design
- **The engine and the HEARTS rules hard-code no language or country.** They produce codes (field
  names, enum values, flag codes, reminder slots), and locale packs turn codes into words or audio.
- **One config value** (`config.json` → `profile`) selects a profile, e.g. `fr-dje`:
  worker locale `fr`, patient voice locale `dje`, fallback `en`.
- **Locale packs:**
  - `fr` (health worker): UI strings, flag texts, the extraction lexicon, the SMS template
  - `dje` (patient): **voice clips only**, no text
  - `en`: fallback for every string
- **Zarma voice clips (recorded, one speaker):** `intro`, 7 weekday clips (`mon`…`sun`), `clinic`,
  `refill`. The tool concatenates them, e.g. intro + weekday + clinic.
  - The day clips say "you will come back this coming [day]". There is no please/thank-you, which is
    natural in Zarma.
  - French loanwords are used where natural (*hôpital*, *médicament*).
  - The voice reminder is sent in the **evening before the visit** (configurable, 1–2 days), so
    "this coming [day]" is always correct.

## Demo path (hosted page, phone-sized, then airplane mode)
1. **Banner:** "Synthetic patients only. Try a sample dictation, then turn on airplane mode."
   The health worker sets or enters a **PIN**.
2. The health worker **dictates** a French note (local Whisper service) or **types** it.
   **Hosted mode:** pick one of 3–4 sample dictations. Their transcripts were precomputed by the
   local offline model, and the page says so.
3. The extractor fills the **fixed record** in the browser. **BP readings are typed numeric fields.**
   A number taken from speech only pre-fills the field and is **always** marked "please check".
4. **HEARTS protocol-gap flags** appear, e.g.:
   - "BP high on a single reading. HEARTS says repeat the measurement."
   - "No follow-up date."
   - "Woman of reproductive age: pregnancy status not recorded."
   - If BP is very high **and** urgent symptoms are present: "Urgent: ask a clinician / refer today."
5. The health worker fixes the fields and taps **Approve**. The record is saved in **IndexedDB on
   the device**.
6. The **outbox** shows a **Zarma voice reminder** (intro + Tuesday + clinic, playable), queued for
   the evening before the visit, plus a **short French SMS** ("Rappel : RDV au CSI mardi."). Neither has clinical
   content. In airplane mode the outbox holds both and shows "will send when the network returns".

## The small AI component (and why a simpler tool won't do)
- **Task:** turn a dictated or typed French clinical note (abbreviations, numbers, negations) into a
  fixed structured record with a confidence score for each field.
- **Why AI:** a form *could* capture the same fields, but filling it is the record-keeping burden.
  SMS-only tools (Mwana, mTrac) move existing data; they can't create it from a dictated note. The
  AI parts are **speech recognition** (French) and **information extraction**. The protocol checks
  are deliberately **not** AI: they are cited rules that cannot hallucinate.
- **Components:**
  - **ASR:** offline French Whisper **tiny or base**, chosen by S0. Candidates (MIT licence):
    - faster-whisper tiny: 76 MB
    - faster-whisper base: 145 MB
    - whisper.cpp tiny-q5_1: 32 MB
    - whisper.cpp base-q5_1: 60 MB

    It runs as a **local Python service** on the health-centre laptop, which the page calls when
    available. Audio never leaves the device. Whisper can produce text that wasn't said, so the
    worker always sees the transcript, and numbers are always marked "please check".
  - **Extractor (in the browser, JavaScript):** a French lexicon (abbreviations: TA, DT, ttt,
    RDV…), regular expressions for numbers, and a **tiny classifier** (char n-gram logistic
    regression). It is trained in Python and exported as JSON weights (< 5 MB). It decides whether
    each symptom or adherence phrase is present, absent or denied.
  - **Rules (in the browser, JavaScript):** HEARTS gap and urgent flags, one cited rule per
    function. They take codes in and return codes out.
  - **Fail-safe:** a field below the confidence threshold, missing, or taken from speech is marked
    "please check" and cannot be silently approved. If the speech service is down, the page falls
    back to typing.
- **Output space is fixed:** record fields, flag codes, SMS template and voice clips are closed lists.

## Architecture
- **Static front-end (HTML/JS, no framework).** The extractor, rules, record form, PIN gate and
  outbox simulation all run in the browser. Records are stored in **IndexedDB**. A **service worker**
  makes the page work offline after the first load.
- **Python only for:**
  - (a) `ml/`: training, and exporting the classifier weights and lexicon to JSON for the front-end
  - (b) `speech/`: a local offline Whisper service (in a separate `.venv-speech`)
- **Hosting:** static deployment (GitHub Pages or Vercel), redeployed at every milestone. Hosted
  voice uses precomputed sample transcripts (clearly labelled); live dictation needs the local service.

## Clinical grounding (verify every number before it goes into code)
- WHO HEARTS technical package: *Evidence-based treatment protocols* (2018) and the WHO guideline on
  pharmacological treatment of hypertension in adults (2021). Covers the thresholds for raised BP, the
  repeat-measurement rule, the urgent-referral criteria, follow-up intervals, and the pregnancy caution.
- Niger national hypertension / NCD protocol, if it can be found quickly.
- Any number not traced to one of these is marked `TODO-CLINICAL`.

## Data
| Dataset | Use | Licence | Size | Real / synthetic |
|---|---|---|---|---|
| French visit notes, generated from templates (`ml/gen_synthetic.py`) | train classifier (2,608 clauses) + dev (300 notes) | ours | 1,500 + 300 notes | **SYNTHETIC** |
| **Gold set:** 30 French dictation clips (ElevenLabs TTS, **3 male voices: A = clips 1–10, B = 11–20, C = 21–30**) + `gold_labels.csv`; script text drafted with AI help, checked by the author | dev 10 clips (error analysis) / **test 20 clips, frozen**; speech→record and typed→record | ours (TTS output) | 30 clips, 286 s | **SYNTHETIC voice, SYNTHETIC patients** |
| Gold noisy copies: 15 clips + synthetic fan / street / chatter noise at 10 dB SNR | robustness test (clean vs noisy reported separately) | ours | 15 clips, 139 s | **SYNTHETIC** |
| Zarma voice clips (intro, 7 weekdays, clinic, refill) | patient reminders | ours | 10 clips, 0.8 MB | real voice, one speaker |
| **Whisper small** (demo) / base (low-end fallback), faster-whisper int8; tiny tested | French ASR | MIT | small 486 MB, base 148 MB, tiny 78 MB | pretrained |
| WHO HEARTS 2018 + WHO 2021 hypertension guideline (PDFs) | rule thresholds | WHO | n/a | real |
| WHO GHO, Niger DHS, GSMA, World Bank SDI | problem evidence | open | n/a | real |
| Feriji (27Group/Feriji): Zarma–French parallel text | **next steps only**, not used | **CC-BY-NC-4.0** (non-commercial), gated | n/a | real |

**Gold test set:** synthetic TTS dictations, labelled in a CSV and frozen. It is never used for
training and never shown to the training-sentence generator.

Label conventions:
- symptoms are present / absent / uncertain / not_mentioned;
- "pas de symptômes" / "pas de plaintes" means all four symptoms are absent;
- "uncertain" must surface as "not sure, please check".

We report:
- field accuracy end to end: speech→record vs typed→record;
- rules-only vs rules + classifier;
- clean vs noisy.

**What our data does not cover (for the video):**
- **No real Nigerien-accented French speech was tested.** All test audio is synthetic. The key next
  step is to test with health workers in Niger.
- **No female voice** in the French test audio (3 male TTS voices only).
- **Zarma reminders are recorded by one speaker.** In deployment, clinic staff would record them so
  patients hear a voice they trust.
- Zarma written literacy limits: we don't use Zarma text at all.
- Zarma speech recognition: no usable model exists, so the patient never talks *to* the AI.
- Everyday Zarma uses French loanwords (*hôpital*, *médicament*); the clips use them where natural.
- Real clinic noise: our noise is synthetic, at a single SNR.
- Real clinician phrasing: the training sentences and lexicon encode our own assumptions.
- Non-hypertension visits.

## Data handling (pass/fail answers)
- **Where it sits:** in the browser's IndexedDB on the health worker's device. The hosted page has
  no backend; records never leave the browser. The speech service runs on `localhost`, so audio
  never leaves the device either.
- **Who can read it:** the health worker, behind a **PIN gate**. This is an access gate, not
  encryption. Encryption at rest is **claimed only if implemented and tested**.
- **Lost phone:** the PIN gate applies. Encryption is the honest next step.
- **Shared phone (Noor's):** the voice reminder and the SMS only say *when* and *where*, never why.
- **Consent:** a one-line verbal consent checkbox at the start of the visit.

## Scope
- **Must (Tier 1):**
  - a static PWA with a service worker, demo banner and PIN gate, hosted
  - typed French note → fixed HTN record → "please check" flags
  - HEARTS gap and urgent flags
  - the health worker approves; the record goes to IndexedDB
  - outbox: concatenated Zarma voice reminder + short French SMS, evening slot, held while offline
  - hosted sample dictations with precomputed transcripts (labelled)
  - gold-set evaluation (speech→record and typed→record)
- **Should (only after M2):**
  - live dictation through the local Whisper service
  - refill reminder (Zarma `refill` clip)
  - list of patients who missed follow-up
- **Stretch (only if ahead at 09:00 Sun):** DHIS2 tracker-event JSON export; small clinic dashboard.
- **Won't (this weekend):**
  - Zarma speech recognition, Zarma text SMS, the Zarma reply classifier
  - a native Android build, a real SMS / voice gateway, IVR calls
  - other conditions, DHIS2 sync, medicine dosing advice

## Status (Sat ~23:00)
- Done: M0 (static PWA, offline), S0 (Whisper base chosen), M1 (rules + HEARTS flags +
  evening-before Zarma reminders), M2 (classifier + gold eval), local speech service, hosted samples.
- Not done: deploy (needs your OK), typed→record eval (script missing). See `docs/log.md` →
  Questions for morning.

## Plan (CAT; kickoff ~17:00 Sat; **submission time TO CONFIRM**, assumed 15:00 Sun)
- **M0 static skeleton + deploy** ......... Sat 21:30
  - PWA shell, service worker, banner, PIN gate, IndexedDB, outbox stub, locale packs
  - **first hosted deploy**
- **S0 French Whisper** (45 min cap) ...... as soon as your first 5 clips arrive
  - measure WER, number accuracy, size and real-time factor for tiny vs base
  - report the download size before fetching
- **M1 Tier 1 on typed input + redeploy .. Sat 23:30**
  - French lexicon and number rules, HEARTS flags, outbox with Zarma clips, sample dictations
- **M1b backup demo video ................. Sat 23:59** (voice-first or typed-first decision due here)
- **M2 classifier + gold-set eval ........ Sun 01:30** (time freed now that the JS port is the architecture)
- sleep .................................. Sun 01:30–06:30
- Should items + local speech service .... Sun 06:30–09:00
- Safety review + polish + redeploy ...... Sun 09:00–11:30 (/health-safety-review, /small-ai-audit)
- M3 feature freeze ...................... Sun 11:30
- M4 video (5 required parts) + README ... Sun 11:30–14:00
- SUBMIT ................................. Sun 14:00 (1 h buffer)

## Fallbacks
- Whisper struggles with the accent or the numbers → typed-first. The hosted samples still show the
  pipeline, and the speech→record gap is reported honestly.
- Local speech service flaky → precomputed transcripts only (already the hosted mode).
- Zarma clips not recorded in time → the outbox shows the queued clip sequence with placeholders.
- Deploy fails on one host → switch between GitHub Pages and Vercel. Last resort: run locally and
  screen-record.
- Behind schedule → cut Stretch, then the missed-follow-up list, then refill reminders.
  Never cut: Tier 1, the offline proof, the "please check" fail-safe, the safety wording.

## Pitch prep
- **"Less-supported language?"** Zarma *is* the less-supported language. Where no trustworthy
  model exists, we use the AI on the health worker's side (French) and reach the patient with
  **recorded human voice**, the safest thing that works. Swapping in Hausa or Fulfulde means
  recording 10 clips, not training a model. Next step: Zarma–French data such as Feriji (licence is
  non-commercial; needs permission).
- **"Why not SMS only?"** Mwana and mTrac moved existing data, and a Zarma text SMS reaches no one
  who can't read it. We create the record from the dictated note, check it against the protocol, and
  speak to the patient.
- **Scale:** a locale pack plus a protocol pack. The engine is language-neutral. The record can
  export to DHIS2, which ministries in 70+ countries already use.

## Sourced facts for the pitch (Niger), verified Sun
- **Health workforce:** Niger has **3.1 doctors + nurses + midwives per 10,000** population.
  Source: WHO Global Health Observatory, as tabulated in BMJ 2021, "Demographic challenges and
  opportunities for child health programming in Africa and Asia", table 1 (data 2014–18):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7968446/table/tbl1
- **Hypertension (May Measurement Month 2017–19, Niger):** 2,297 screened; **33.2% hypertensive, only
  3.4% recorded as on treatment**. Medication data was not collected in 2017 and was missing for 55.3%
  (2018) and 89.3% (2019). Source: *European Heart Journal Supplements* 2022:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9547524/
- **WHO STEPS 2007, Niger:** high blood pressure ≈ 36% (36.3%), as cited in the same paper.
- Not sourced (left out): Niger DHS, GSMA, World Bank SDI.
