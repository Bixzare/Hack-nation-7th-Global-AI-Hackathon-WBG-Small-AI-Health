"""One-time frozen-TEST run through the live-dictation configuration: audio -> webm/opus (what the browser's
MediaRecorder sends) -> Whisper small, language="fr", VAD on, no prompt (speech/server.py settings).
Writes data/gold/transcripts/small-live_{clean,noisy}.json; prints only timing. Score with ml/final_report.mjs.

Run: .venv-speech/Scripts/python speech/transcribe_live_config.py
"""
import csv
import json
import subprocess
import tempfile
import time
from pathlib import Path

import imageio_ffmpeg
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
TEST = set(json.loads((GOLD / "split.json").read_text())["test"])


def main():
    model = WhisperModel("small", device="cpu", compute_type="int8", download_root=str(ROOT / "models" / "whisper"),
                         local_files_only=True)
    rows = list(csv.DictReader(open(GOLD / "manifest.csv", encoding="utf-8")))
    with tempfile.TemporaryDirectory() as tmp:
        for cond in ("clean", "noisy"):
            out, t0 = {}, time.perf_counter()
            for r in rows:
                if int(r["id"]) not in TEST or not r[f"{cond}_wav"]:
                    continue
                webm = Path(tmp) / f"{r['id']}_{cond}.webm"
                subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-y", "-i", str(GOLD / r[f"{cond}_wav"]),
                                "-c:a", "libopus", "-b:a", "32k", str(webm)], check=True)
                segs, _ = model.transcribe(str(webm), language="fr", beam_size=5, vad_filter=True,
                                           condition_on_previous_text=False)
                out[r["id"]] = " ".join(s.text.strip() for s in segs).strip()
            (GOLD / "transcripts" / f"small-live_{cond}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"small-live {cond}: {len(out)} test clips in {time.perf_counter() - t0:.0f} s")


if __name__ == "__main__":
    main()
