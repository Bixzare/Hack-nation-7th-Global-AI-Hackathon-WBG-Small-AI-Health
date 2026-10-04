"""Word-level ASR confidence for the gold clips, through the live configuration (webm/opus, VAD on,
language="fr", word_timestamps=True). Writes data/gold/transcripts/small-words_<split>_<cond>.json:
  {id: {"text": ..., "words": [{"w": word, "p": probability}, ...]}}
Prints only timing. --split dev (threshold tuning) or test (one final run).

Run: .venv-speech/Scripts/python speech/word_probs.py dev [--loudnorm]
"""
import csv
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import imageio_ffmpeg
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
FF = imageio_ffmpeg.get_ffmpeg_exe()


def main(split, loudnorm):
    ids = set(json.loads((GOLD / "split.json").read_text())[split])
    model = WhisperModel("small", device="cpu", compute_type="int8", download_root=str(ROOT / "models" / "whisper"),
                         local_files_only=True)
    rows = list(csv.DictReader(open(GOLD / "manifest.csv", encoding="utf-8")))
    tag = "small-words" + ("-ln" if loudnorm else "")
    with tempfile.TemporaryDirectory() as tmp:
        for cond in ("clean", "noisy"):
            out, t0 = {}, time.perf_counter()
            for r in rows:
                if int(r["id"]) not in ids or not r[f"{cond}_wav"]:
                    continue
                webm = Path(tmp) / f"{r['id']}.webm"
                subprocess.run([FF, "-v", "error", "-y", "-i", str(GOLD / r[f"{cond}_wav"]), "-c:a", "libopus", "-b:a", "32k", str(webm)], check=True)
                src = webm
                if loudnorm:  # same pre-processing as speech/server.py
                    src = Path(tmp) / f"{r['id']}.wav"
                    subprocess.run([FF, "-v", "error", "-y", "-i", str(webm), "-af", "loudnorm=I=-20:TP=-2:LRA=11",
                                    "-ar", "16000", "-ac", "1", str(src)], check=True)
                segs, _ = model.transcribe(str(src), language="fr", beam_size=5, vad_filter=True,
                                           condition_on_previous_text=False, word_timestamps=True)
                words = [{"w": w.word.strip(), "p": round(w.probability, 3)} for s in segs for w in (s.words or [])]
                out[r["id"]] = {"text": re.sub(r" (?=['’-])", "", " ".join(x["w"] for x in words)).strip(), "words": words}
            (GOLD / "transcripts" / f"{tag}_{split}_{cond}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
            print(f"{tag} {split} {cond}: {len(out)} clips in {time.perf_counter() - t0:.0f} s")


if __name__ == "__main__":
    main(sys.argv[1], "--loudnorm" in sys.argv)
