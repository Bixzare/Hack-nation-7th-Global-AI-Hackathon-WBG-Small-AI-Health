# Kinyarwanda hypertension visit recorder (prototype)

Small AI for Health — WBG × Hack-Nation 2026. Prototype, not clinically validated; supports, does not
replace, the health worker. All data in this repo is SYNTHETIC.

## Run the demo (offline)
```
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn server:app --app-dir app --port 8000
```
Open http://localhost:8000
