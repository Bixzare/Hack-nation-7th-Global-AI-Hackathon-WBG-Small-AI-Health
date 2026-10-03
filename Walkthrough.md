# Walkthrough: an offline voice-to-record assistant for hypertension care in rural Niger

This document explains a prototype built in one weekend for the World Bank Group "Small AI for
Development" hackathon (Health category), 3–4 October 2026. It covers the problem, what the tool
does, how it works, how it was built step by step, how well it performs, and what it does not yet
do. Every number in this document was measured on the prototype. Every patient and every test voice
is synthetic. No real patient data was used.

Live demo: https://bixzare.github.io/Hack-nation-7th-Global-AI-Hackathon-WBG-Small-AI-Health/

---

## 1. The idea in one paragraph

A nurse at a rural health centre in Niger measures a patient's blood pressure and dictates a short
note in French, the way clinicians already talk. A small speech model running on the health centre's
own laptop turns the voice into text, without internet. A tiny rule engine running in the browser
then fills a fixed hypertension record and checks it against the World Health Organization's HEARTS
protocol. It flags anything urgent, anything missing, and anything it is not sure about. The nurse
checks the record and approves it; nothing is saved without a person's approval. The evening before
the patient's next visit, the patient receives a reminder as recorded voice clips in Zarma, her own
language, plus a short French text message. Neither message contains any medical information.

---

## 2. The problem

The challenge describes Noor, a 38-year-old farmer. Her household shares two phones: her basic phone
and her daughter's smartphone, which is only home at weekends. There is no Wi-Fi, and during the day
her phone stays at the house while she works on the slope. Her nearby clinic is overcrowded, its
clinicians are not always up to date with the latest guidance, and heavy record-keeping means they
cannot give each patient enough attention.

This prototype places Noor at a rural primary health centre, a *centre de santé intégré*, in Niger.
The numbers there are stark:

- Niger has about 3.1 doctors, nurses and midwives for every 10,000 people, according to World
  Health Organization data for 2014 to 2018.
- In blood-pressure screening campaigns in Niger between 2017 and 2019, about one adult in three
  (33.2 percent) had high blood pressure. Only 3.4 percent of them were recorded as being on
  treatment, although medication data was often missing.
- An earlier WHO survey in 2007 found about 36 percent.

Two people need help:

- **The nurse.** They spend precious minutes on paperwork, and protocol steps get missed: a second
  blood-pressure reading not taken, a pregnancy question not asked, no next visit booked.
- **Noor.** Even when a follow-up visit is booked, she may never hear about it in a way she can use.
  A written reminder in French, or even in written Zarma, does not reach someone with limited
  reading literacy.

The problem statement, in the form the challenge asks for:

> Because of this tool, the nurse at Noor's health centre will finish a complete, protocol-checked
> hypertension record before Noor leaves the room, a record they would otherwise write late,
> incompletely, or not at all. And that evening, Noor will hear a reminder of her next visit in
> Zarma on the phone at her house, where she would otherwise receive nothing, or a text she cannot
> read.

---

## 3. Where the tool sits in the day

**In the consultation room.** The nurse measures Noor's blood pressure, then taps a button and speaks
for about ten seconds, for example: "Femme, 38 ans. Tension 162 sur 98. Céphalées depuis trois jours.
Elle oublie parfois ses médicaments. Pas enceinte. Revoir dans deux semaines." That is: woman, 38,
blood pressure 162 over 98, headaches for three days, sometimes forgets her medicine, not pregnant,
see again in two weeks.

**A few seconds later.** The record appears, already filled in: age, sex, both blood-pressure
numbers, four danger symptoms, medication and missed doses, pregnancy status, counselling, and the
next visit. Fields the system is unsure about are highlighted in yellow with the words "please
check". Above the record, a short list of protocol checks appears, with urgent items first.

**Before Noor leaves.** The nurse corrects anything wrong and confirms the highlighted fields. They
tick that the patient agreed to the visit being recorded, and that they asked about danger signs.
If blood pressure could not be measured, they must say why: the device was unavailable, the patient
refused, or another reason. Then they tap Approve. The record is saved on the device.

**The evening before the next visit.** At 18:30 the outbox sends two messages to Noor's household
phone. One is a voice reminder in Zarma, built from short recorded clips: a greeting, the weekday of
the visit, and a closing clip about the health centre. The other is a short French SMS such as
"Rappel : RDV au CSI samedi". If there is no network, both wait in the outbox and go out when the
signal returns.

**Later.** If Noor's visit date passes and she has not come back, she appears on a "not returned"
list. The tool does not call her or decide anything; a person decides whether to call or visit.

---

## 4. How the system works

The system has four parts.

**Part one: speech recognition.** It turns the nurse's French dictation into text using OpenAI's
open-source Whisper model, in its "small" size, running through a library called faster-whisper. It
runs entirely on the health centre's laptop: the audio never leaves the machine, and no internet is
needed. A smaller version, Whisper "base", is the fallback for weaker laptops.

**Part two: the extractor.** It turns the text into a fixed record. It is a rule engine written in
plain JavaScript and runs inside the web browser. It first normalizes the text: lower case, accents
removed, and spoken numbers converted to digits, so "cent soixante-deux sur quatre-vingt-dix-huit"
becomes "162 sur 98". It then finds each item using a French vocabulary list. For symptoms, it looks
at the few words around each mention to decide whether the symptom is present, absent ("pas de
douleur thoracique"), or uncertain ("peut-être", "à préciser"). This is the same idea as the classic
NegEx method used in clinical text processing.

**Part three: the protocol checks.** They compare the record with the WHO HEARTS hypertension
protocol and the 2021 WHO hypertension guideline. These are deterministic rules, not AI, and every
threshold in the code cites its source. Examples:

- Blood pressure above 180 over 110 together with a danger symptom means "urgent: ask a clinician or
  refer today".
- Blood pressure above 200 over 120 is urgent on its own.
- A woman between 15 and 49 with no pregnancy status recorded triggers a reminder to ask, because
  some common blood-pressure medicines must not be used in pregnancy.
- A raised reading measured only once triggers a reminder to take a second reading.

**Part four: the outbox.** It schedules the reminders. The Zarma voice reminder is assembled from ten
recorded clips: an introduction, seven weekday clips, a health-centre clip, and a medicine-refill
clip. Because the weekday clip says "this coming Saturday", the reminder is always sent the evening
before the visit, so the wording is always true.

Around these four parts is a simple, offline-first web app:

- a PIN gate, which is an access gate and not encryption, and the documentation says so;
- local storage of records in the browser, using IndexedDB;
- a service worker, so that after one visit the whole app works in airplane mode.

The hosted demo has no server at all. The page is static, and records stay in the visitor's own
browser.

---

## 5. What the AI does, and why a simpler tool would not do

A paper form or a spreadsheet could hold the same fields. But filling in the form is exactly the
burden the challenge describes, and it takes time away from the patient. Earlier mobile-health
projects mentioned in the challenge, Mwana and mTrac, worked purely by moving existing data around
by SMS. They could not create a record from a conversation.

The AI in this system does two jobs that simple tools cannot. It recognizes speech in French, and it
extracts structured information from loosely spoken clinical language, including abbreviations,
spoken numbers, negations and hedges. The protocol checks are deliberately not AI. They are cited
rules that cannot hallucinate.

The design follows the "fixed list of answers" idea from the challenge guidelines. The record has a
fixed set of fields, each field has a fixed set of allowed values, and the flags, SMS template and
voice clips are all closed lists. The tool never writes free text to the patient, so everything it
can say can be checked in advance for safety.

---

## 6. Safety and human oversight

Safety was designed in from the start rather than added at the end.

- **A person always decides.** Nothing is saved until the nurse confirms every highlighted field,
  confirms consent, and confirms they asked about danger signs.
- **Blood pressure cannot be skipped silently.** A record needs a blood-pressure value, or an explicit
  "not measured" with a recorded reason.
- **"Not sure" is surfaced, never hidden.** Any field below a confidence threshold is marked "please
  check". Any symptom described with hesitation becomes "uncertain" and must be checked.
- **Every number from speech is checked.** A misheard blood pressure is the most dangerous error a
  voice tool can make, so speech-derived numbers can never be approved without the nurse's attention.
- **It never diagnoses.** The flags say what to do: "urgent: ask a clinician or refer today", "take a
  second reading", "ask about pregnancy". They never name a disease or give a verdict.
- **Failures fail safe.** If the extractor ever fails, the nurse gets an empty record with every
  field marked "please check", rather than a wrong record.
- **Messages contain no clinical content.** The Zarma voice clips and the SMS say only when and where
  to come, never why. This matters because the household phone is shared.
- **Health data stays on the device.** Records live in the browser on the health worker's device. The
  speech service listens only on the local machine and keeps no logs.

One safety feature was revised after measurement. The first version always reminded the nurse to
"ask about danger signs" whenever any of the four symptoms was not mentioned. It fired on almost
every note, which risks the alerts being ignored, a problem known as alert fatigue. Now it fires
only when blood pressure is raised, and approval requires a single tap confirming that danger signs
were asked. That tap resolves the flag without hiding it: the record keeps the line "danger signs
asked, confirmed by the health worker" with the time. The flag still appears on 15 of the 20 test
notes, because most test patients have raised blood pressure, but it now costs the nurse one tap and
leaves an audit trail.

---

## 7. Localization: French for the nurse, Zarma by voice for the patient

Each user gets the language and the medium that actually reaches them.

- The nurse writes and speaks French, the working language of the health system, using short
  clinical shorthand.
- Noor is reached in Zarma, and only by voice. Zarma is a less-supported language: there is no
  usable open speech-recognition model for it, and written literacy is limited. So the tool does not
  pretend to understand Zarma. Instead it uses recorded human voice, the safest thing that works.
- The Zarma clips use French loanwords where everyday Zarma does, such as "hôpital" and
  "médicament".

The engine contains no language and no country. Everything language-specific lives in small data
files:

- a French vocabulary file for the extractor;
- text packs for the interface;
- a voice pack listing the Zarma clips;
- one profile setting that selects the combination.

Moving to Hausa or Fulfulde for the patient side means recording about ten new clips, not training a
new model. Moving to another country's protocol means swapping the rule file.

---

## 8. How it was built, step by step

The weekend followed a strict plan:

- one end-to-end demo path, kept working at all times;
- a commit after every working step;
- time-boxes on risky experiments;
- a written log of every decision and every number.

**Step 1: choosing the problem.** The first idea was a voice tool for community health workers in
Rwanda, in Kinyarwanda. The official challenge brief centres on Noor as the patient at an
overcrowded clinic, so the focus moved to adult hypertension follow-up, using the WHO HEARTS
protocol. HEARTS was designed for exactly this kind of non-specialist primary care.

**Step 2: relocalizing to Niger.** The setting then moved to a rural health centre in Niger. The
nurse works in French and the patient speaks Zarma. Zarma's lack of speech technology became a
deliberate design choice: AI on the nurse's side, recorded human voice on the patient's side.

**Step 3: a static, offline-first architecture.** An early version used a small Python server. It was
replaced by a fully static web app, because the challenge wants a clickable demo and because running
everything in the browser is the honest "on-device" story. Python remained only for training,
evaluation, and the local speech service.

**Step 4: verifying the clinical rules.** Before any threshold went into code, it was checked against
the original WHO documents: the HEARTS evidence-based treatment protocols from 2018, and the WHO
guideline on pharmacological treatment of hypertension from 2021. The age range for women of reproductive
age, 15 to 49, follows the World Health Organization's standard definition.

**Step 5: building the test set.** A set of 30 French dictations was created with three different
male synthetic voices from the ElevenLabs text-to-speech service (paid plan), with the correct record for each one
written in a spreadsheet. Fifteen copies were mixed with synthetic background noise: a fan, street
traffic, and clinic chatter. To keep the evaluation honest, the set was split, using a fixed random
seed, into 10 development clips for error analysis and 20 test clips that were frozen and only used
for final scoring.

**Step 6: the speech-model trial.** Three sizes of Whisper were compared on the same clips: tiny,
base and small. Small was clearly the most accurate. Base became the documented fallback.

**Step 7: the extractor and a lesson from the data.** The rules were written from general knowledge of
French clinical notes, never from the test set. Typed text was handled almost perfectly, but the
headache field failed on speech. Looking only at the development clips revealed why: Whisper heard
the medical word "céphalées" as everyday phrases like "c'est fallé" or "s'effaler". A single
sound-alike pattern fixed it. This is a small, concrete example of what localizing AI really
involves: the model's mistakes are specific to a language and a vocabulary, and you only find them
by testing with realistic speech.

**Step 8: a classifier that did not help, and saying so.** A tiny machine-learning classifier, 113
kilobytes, was trained on 1,500 synthetic notes to judge whether each symptom was present, absent or
uncertain. On the test set it added nothing. The remaining errors happened before it: words the
vocabulary did not cover, or words the speech model misheard. So the shipped version is rules-only,
and the classifier stays in the code with the result documented.

**Step 9: safety review, audit and deployment.** A health-safety review checked:

- the wording, so that no message reads like a diagnosis or an "all clear";
- that the thresholds are cited;
- that failures default to the safe action.

A "small AI" audit then measured size, speed, memory, and offline behaviour. Before publishing, the
whole code history was checked for keys, model files and large files. The app was then deployed to
GitHub Pages and tested in an automated headless browser, including a reload in offline mode.

---

## 9. Does it work? The results

All results below are on the 20 frozen test clips, with synthetic voices. Each clip has 14 record
fields, so 280 fields in total.

**Typed notes**, which skip speech recognition entirely, gave 271 of 280 fields correct, or 96.8
percent.

**Dictated notes with Whisper small**, the demo model:

- 267 of 280 fields correct on clean audio, or 95.4 percent;
- 116 of 126 on the noisy clips, or 92.1 percent;
- all 5 urgent cases flagged on clean audio, and all 3 on noisy audio, with no false urgent alarms;
- all 11 danger symptoms that were truly present were detected, and none of the 69 that were not
  present was wrongly reported;
- most importantly, no danger symptom that was present was ever marked as absent, so there was no
  false reassurance.

**The smaller fallback, Whisper base**, was faster but less accurate: 87.9 percent of fields on clean
audio and 79.4 percent on noisy audio, catching 4 of the 5 urgent cases.

**Speed and size.**

- The extractor and rules take about half a millisecond per note. The whole web app is about 1.7
  megabytes.
- Whisper small is 486 megabytes. It takes about 9.4 seconds to transcribe a 10-second dictation on
  a laptop CPU, using about 360 megabytes of memory.
- Whisper base is 148 megabytes and takes about 3.3 seconds.

The team chose accuracy over speed: in health care, catching urgent cases matters more than saving
six seconds.

These numbers come with clear caveats. The test set is small, with only 11 truly present danger
symptoms, so the margins of error are wide. All voices are synthetic. And part of the vocabulary was
refined after looking at aggregate error patterns, which is fully disclosed in the project log, so
the test numbers may be slightly optimistic.

---

## 10. What the data does not cover

Being clear about the limits is part of responsible AI.

- **Real Nigerien voices.** No real Nigerien-accented French speech was tested; every test voice is
  synthetic. The most important next step is testing with health workers in Niger.
- **Female voices.** All three test voices are male.
- **The Zarma clips.** They were recorded by one speaker. In real use, clinic staff would record
  them, so patients hear a voice they know and trust.
- **Zarma itself.** There is no Zarma speech recognition, so the patient never speaks to the AI.
  Written Zarma is not used at all.
- **Real clinic noise.** The background noise was synthetic, at a single loudness level.
- **Real clinicians' phrasing.** The vocabulary and the training sentences reflect the builder's
  assumptions about how nurses write.
- **Other visit types.** Only hypertension visits are covered.

---

## 11. Technology summary

- **Front end:** plain HTML and JavaScript, with no framework. Records in IndexedDB, a service worker
  for offline use, hosted on GitHub Pages.
- **Speech:** OpenAI Whisper small (base as fallback) through faster-whisper with 8-bit inference,
  run as a local service on the health-centre laptop.
- **Extraction and rules:** a language-neutral JavaScript engine, a French vocabulary file, and WHO
  HEARTS rules with citations in the code.
- **Patient messages:** recorded Zarma voice clips and a French SMS template, in a store-and-forward
  outbox. The SMS gateway is simulated in this prototype.
- **Evaluation tools:** Python and Node scripts for the synthetic data generator, the classifier
  training, field accuracy, word error rate, urgent-flag recall, sensitivity and specificity,
  latency, and an automated end-to-end browser test.

---

## 12. What happens next

The same engine works with a different protocol (diabetes, antenatal care, child illness) and a
different language pack. Approved records could be exported to DHIS2, the open-source health
information system that ministries in more than 70 countries already use.

The most important next steps are:

- testing with real nurses' voices in Niger;
- measuring speed on a typical low-cost health-centre laptop;
- costing real SMS and voice-call delivery;
- exploring a smaller speech model that could run directly on the phone.

---

## 13. What localizing AI means to me

*Draft. The builder should rewrite this section in their own words before use.*

Localizing AI is less about having the biggest model and more about paying attention to the people
and the language in front of you. In this project that meant several things. A nurse's French is
full of abbreviations and spoken numbers. A well-known speech model hears a common medical word as
an everyday phrase. And the most respectful way to reach a Zarma-speaking patient today is a
recorded human voice, not a machine guessing at her language. It also meant being honest about
trade-offs:

- choosing a slower model because it catches urgent cases;
- shipping simple rules when a classifier did not help;
- stating plainly what the test data does not cover.

Building small, checkable tools, and testing them with the people who will actually use them, is how
AI becomes useful where it is needed most.

---

## Key facts at a glance

- **Users:** a French-speaking nurse at a rural health centre in Niger, and a Zarma-speaking patient
  with a shared basic phone.
- **Input:** about ten seconds of French dictation, or typed text.
- **Output:** a fixed hypertension record, WHO HEARTS protocol flags, and an evening-before reminder
  as Zarma voice clips plus a French SMS.
- **Accuracy (test set, Whisper small):** 95.4% of fields on clean audio, 92.1% on noisy audio; all
  urgent cases caught; no false reassurance.
- **Size and speed:** the web app is 1.7 MB and extraction takes under a millisecond; the speech
  model is 486 MB and takes about 9 seconds per 10-second clip on a laptop.
- **Offline:** yes. Works in airplane mode after the first load; messages queue until there is
  signal.
- **Human in the loop:** nothing is saved without the nurse's confirmation; uncertainty is always
  shown.
- **Status:** a prototype, not clinically validated, built to support health workers, not replace
  them.
