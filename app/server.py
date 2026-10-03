"""Local web app: runs fully offline on the health-centre laptop (or phone, see M2 option).

Run:  .venv/Scripts/python -m uvicorn server:app --app-dir app --port 8000
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
from extractor import extract
from schema import FIELDS

STATIC = Path(__file__).resolve().parent / "static"
app = FastAPI(title="Kin HTN visit recorder (prototype)")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


class Narrative(BaseModel):
    text: str


class Approval(BaseModel):
    narrative: str
    record: dict


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/schema")
def schema():
    return {name: {"kind": k, "values": v, "label": label} for name, (k, v, label) in FIELDS.items()}


@app.post("/api/extract")
def api_extract(body: Narrative):
    return {"record": extract(body.text)}


@app.post("/api/records")
def api_save(body: Approval):
    # Human-in-the-loop: nothing is saved unless every field was confirmed by the health worker.
    unchecked = [k for k in FIELDS if body.record.get(k, {}).get("check", True)]
    if unchecked:
        raise HTTPException(400, {"error": "fields still need checking", "fields": unchecked})
    return {"id": db.save(body.narrative, body.record)}


@app.get("/api/records")
def api_list():
    return db.list_records()
