"""S0: transcribe the gold clips (clean + noisy) offline with French Whisper, measure size and speed.

Transcripts are written to data/gold/transcripts/ and NEVER printed: the gold set is test-only, and
the person writing the extractor must not read it. Only aggregate numbers are printed.

Run: .venv-speech/Scripts/python speech/transcribe_gold.py tiny base
"""
import csv
import json
import os
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
MODELS = ROOT / "models"
OUT = GOLD / "transcripts"

# Generic French clinical vocabulary (not taken from the gold set) to bias decoding toward the domain.
DOMAIN_PROMPT = ("Consultation HTA. TA en mmHg, céphalées, douleur thoracique, dyspnée, vision floue, "
                 "sous traitement, oublis, grossesse, conseils hygiéno-diététiques, RDV, référé.")


def dir_size_mb(p: Path) -> float:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6


def run(size: str, prompt: bool):
    t0 = time.perf_counter()
    model = WhisperModel(size, device="cpu", compute_type="int8", download_root=str(MODELS / "whisper"),
                         cpu_threads=os.cpu_count() or 4)
    load_s = time.perf_counter() - t0
    rows = list(csv.DictReader(open(GOLD / "manifest.csv", encoding="utf-8")))
    tag = f"{size}{'-prompt' if prompt else ''}"
    for cond in ("clean", "noisy"):
        out, audio_s, proc_s = {}, 0.0, 0.0
        for r in rows:
            path = r[f"{cond}_wav"]
            if not path:
                continue
            t = time.perf_counter()
            segs, info = model.transcribe(str(GOLD / path), language="fr", beam_size=5, vad_filter=False,
                                          condition_on_previous_text=False,
                                          initial_prompt=DOMAIN_PROMPT if prompt else None)
            text = " ".join(s.text.strip() for s in segs)
            proc_s += time.perf_counter() - t
            audio_s += info.duration
            out[r["id"]] = text
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{tag}_{cond}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{tag:12s} {cond:5s} clips={len(out):2d} audio={audio_s:6.1f}s proc={proc_s:6.1f}s "
              f"RTF={proc_s / audio_s:.3f}")
    snap = next((MODELS / "whisper").glob(f"models--Systran--faster-whisper-{size}"), None)
    print(f"{tag:12s} load={load_s:.1f}s model_on_disk={dir_size_mb(snap) if snap else 0:.0f}MB")


if __name__ == "__main__":
    for size in sys.argv[1:] or ["tiny", "base"]:
        run(size, prompt=False)
        run(size, prompt=True)
