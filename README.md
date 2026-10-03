# HTN Visit Recorder: offline dictation-to-record for rural health centres (prototype)

Small AI for Health, WBG × Hack-Nation 2026. **Prototype, not clinically validated. It supports the
health worker and does not replace them. All patients are SYNTHETIC.**

A nurse in a rural health centre in Niger dictates or types a short French note. The app turns it
into a fixed hypertension record, checks it against WHO HEARTS, and the nurse approves it. The
patient then gets a reminder as recorded Zarma voice clips, plus a short French SMS, with no
clinical content.

## Run locally (offline after first load)
```
py -3.11 -m http.server 8080 -d app/web --bind 127.0.0.1
```
Open http://127.0.0.1:8080. No build step and no dependencies. Records stay in the browser (IndexedDB).

## Deploy (static)
- **GitHub Pages:** push to `main`; `.github/workflows/pages.yml` publishes `app/web`. In the repo
  settings, under Pages, set the Source to "GitHub Actions".
- **Vercel:** import the repo, set the Root Directory to `app/web`, Framework "Other", no build command.

## Layout
- `app/web/`: the whole product (engine, rules, UI, service worker). Language and country live only
  in `config.json`, `profiles/` and `locales/`.
- `ml/`: training and export of the classifier and lexicon to JSON (M2).
- `speech/`: local offline Whisper service (S0+), in its own `.venv-speech`.
