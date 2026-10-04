"""Local offline speech service for live dictation (health-centre laptop).

Binds to 127.0.0.1 only: audio never leaves the device. The web page (local or hosted) calls it when
available and falls back to typing when it is not.

  GET  /health      -> {"ok": true, "model": "..."}
  POST /transcribe  body = audio bytes (webm/ogg/wav/mp3) -> {"text": "...", "audio_s": .., "proc_s": ..}

Settings were chosen on gold DEV clips (webm/opus, as the browser sends): language="fr", VAD on, no
initial_prompt. The prompt invented numbers on cut-off phrases ("Tension 100 sur 100") and lowered dev
field accuracy from 96.4% to 95.0%; with VAD off, silence produced subtitle-credit text.

Run: .venv-speech/Scripts/python speech/server.py [--model small|base] [--port 8765]
"""
import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import imageio_ffmpeg
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 20 * 1024 * 1024
# Whisper's known silence hallucinations in French (subtitle credits from its training data). Seen on silent
# and room-tone clips when VAD is off (speech/dictation_experiments.py). Dropped as a second safety net.
HALLUCINATIONS = ("sous-titres réalisés par", "sous-titrage st", "amara.org", "merci d'avoir regardé")
# Distance: recordings quieter than this (mean volume) are loudness-normalised before Whisper. Gold DEV
# clips sit at -26 to -32 dB; at -60 dB (phone far away) Whisper dropped "Homme" and normalisation restored
# it, while normalising already-level clean clips cost about 1.4 points on dev (speech/quiet_test.py).
QUIET_DB = -40.0
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MODEL = None
MODEL_NAME = ""


def mean_volume_db(path):
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.search(r"mean_volume: (-?[\d.]+) dB", out)
    return float(m.group(1)) if m else None


def loudnorm(path):
    out = path + ".norm.wav"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", path, "-af", "loudnorm=I=-20:TP=-2:LRA=11",
                    "-ar", "16000", "-ac", "1", out], check=True)
    return out


class Handler(BaseHTTPRequestHandler):
    def _headers(self, code=200, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        # The page may be served from another origin (hosted demo); allow it to reach this local service.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")  # Chrome Private Network Access
        self.end_headers()

    def _json(self, obj, code=200):
        self._headers(code)
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            return self._json({"ok": True, "model": MODEL_NAME})
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path != "/transcribe":
            return self._json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length", 0))
        if not 0 < n <= MAX_BYTES:
            return self._json({"error": "audio missing or too large"}, 400)
        data = self.rfile.read(n)
        fd, path = tempfile.mkstemp(suffix=".audio")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            t = time.perf_counter()
            vol = mean_volume_db(path)
            src = loudnorm(path) if vol is not None and vol < QUIET_DB else path
            segs, info = MODEL.transcribe(src, language="fr", beam_size=5, vad_filter=True,
                                          condition_on_previous_text=False, word_timestamps=True)
            words = [{"w": w.word.strip(), "p": round(w.probability, 3)} for s in segs for w in (s.words or [])]
            text = " ".join(x["w"] for x in words).strip()
            if any(h in text.lower() for h in HALLUCINATIONS):
                text, words = "", []
            self._json({"text": text, "words": words, "audio_s": round(info.duration, 2),
                        "proc_s": round(time.perf_counter() - t, 2), "model": MODEL_NAME,
                        "mean_db": vol, "normalised": src != path})
        except Exception as e:  # report, never crash the service
            self._json({"error": str(e)}, 500)
        finally:
            for f in (path, path + ".norm.wav"):
                if os.path.exists(f):
                    os.remove(f)

    def log_message(self, fmt, *args):  # no request logging: transcripts are health data
        pass


def main():
    global MODEL, MODEL_NAME
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="small")  # demo model; base = low-end fallback
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    MODEL_NAME = f"faster-whisper-{a.model} int8 (offline)"
    MODEL = WhisperModel(a.model, device="cpu", compute_type="int8", download_root=str(ROOT / "models" / "whisper"),
                         local_files_only=True)
    print(f"speech service on http://127.0.0.1:{a.port} ({MODEL_NAME})")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
