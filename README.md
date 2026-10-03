# HTN Visit Recorder: offline dictation-to-record for rural health centres (prototype)

Small AI for Health, WBG × Hack-Nation 2026. **Prototype, not clinically validated. It supports the
health worker and does not replace them. All patients and all test voices are SYNTHETIC.**

A nurse in a rural health centre in Niger dictates or types a short French note. The app turns it into
a fixed hypertension record, checks it against WHO HEARTS, and the nurse approves it. The patient then
gets a reminder the evening before the visit, as recorded Zarma voice clips plus a short French SMS,
with no clinical content.

## Credits and data
- Sample dictation voices: **ElevenLabs TTS (synthetic)**, generated for this non-commercial hackathon prototype.
- Zarma reminder clips: recorded by a team member (one speaker).
- Clinical rules: WHO HEARTS technical package (2018) and WHO hypertension guideline (2021). See `app/web/engine/rules.js`.
- Speech model: OpenAI Whisper via faster-whisper (MIT), run locally; not included in this repo.

## Run locally (offline after first load)
```
py -3.11 -m http.server 8080 -d app/web --bind 127.0.0.1
```
Open http://127.0.0.1:8080. There's no build step. Records stay in the browser (IndexedDB).

Optional live dictation (offline Whisper on this machine; audio never leaves it):
```
py -3.11 -m venv .venv-speech
.venv-speech/Scripts/python -m pip install faster-whisper
.venv-speech/Scripts/python speech/server.py --model base   # first run: drop local_files_only or pre-download
```

## Evaluate
```
node ml/eval.mjs dev                                             # synthetic dev set
node ml/eval.mjs gold data/gold/transcripts/base_clean.json      # gold speech→record (add --clf, --unseen)
node ml/eval_flags.mjs data/gold/transcripts/base_clean.json     # urgent-flag recall
```
Gold audio and transcripts live in `data/` (gitignored). Results are in `docs/log.md`.

## Deploy (static)
- **GitHub Pages:** push to `main`; `.github/workflows/pages.yml` publishes `app/web`. In the repo
  settings, under Pages, set the Source to "GitHub Actions".
- **Vercel:** import the repo, set the Root Directory to `app/web`, Framework "Other", no build command.

## Layout
- `app/web/`: the whole product.
  - `engine/`: language-neutral extractor, HEARTS rules, outbox, store, PIN gate.
  - `lexicon/fr.json`, `locales/`, `profiles/`: everything language- or country-specific.
  - `models/symptom_clf.json`: tiny classifier.
  - `audio/dje/`: Zarma voice clips.
  - `samples/`: hosted sample dictations.
- `ml/`: synthetic data generator, classifier training/export, evaluation, smoke test.
- `speech/`: S0 transcription script and the local Whisper service.
