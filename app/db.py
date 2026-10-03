"""Local SQLite store. Health data stays on this device (data/ is gitignored)."""
import json
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "records.db"


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "CREATE TABLE IF NOT EXISTS records ("
        "id INTEGER PRIMARY KEY, created_at TEXT, narrative TEXT, record_json TEXT)"
    )
    return con


def save(narrative: str, record: dict) -> int:
    with closing(connect()) as con, con:
        cur = con.execute(
            "INSERT INTO records (created_at, narrative, record_json) VALUES (?, ?, ?)",
            (datetime.now().isoformat(timespec="seconds"), narrative, json.dumps(record)),
        )
        return cur.lastrowid


def list_records(limit: int = 20):
    with closing(connect()) as con:
        rows = con.execute(
            "SELECT id, created_at, record_json FROM records ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [{"id": r[0], "created_at": r[1], "record": json.loads(r[2])} for r in rows]
