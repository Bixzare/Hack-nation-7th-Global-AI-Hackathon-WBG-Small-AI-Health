"""Live-dictation experiments on the gold DEV split only (never the frozen test clips).

Builds short phrases (first 2.5 s of each dev clip, e.g. "Femme, 38 ans."), a 3 s silence clip, and
webm/opus versions (what the browser's MediaRecorder sends). Then compares decoding settings:
  vad_filter on/off  x  initial_prompt none/clinical
Reports: transcripts of the short phrases, text produced on silence (must be empty), and writes full-clip
transcripts for dev field-accuracy scoring (node ml/eval.mjs gold <file> --split=dev).

Run: .venv-speech/Scripts/python speech/dictation_experiments.py
"""
import json
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg  # noqa: F401  (installed in .venv-speech? fall back below)
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
OUT = ROOT / "data" / "s0" / "dictation"
DEV = json.loads((GOLD / "split.json").read_text())["dev"]
PROMPT = "Consultation hypertension. Femme, 45 ans. Tension 150 sur 95. Céphalées, douleur thoracique, dyspnée."


def ffmpeg():
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(*args):
    subprocess.run([ffmpeg(), "-v", "error", "-y", *map(str, args)], check=True)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for i in DEV:
        src = GOLD / "clean" / f"fr_{i:02d}.wav"
        short = OUT / f"short_{i:02d}.wav"
        run("-i", src, "-t", "2.5", "-ar", "16000", "-ac", "1", short)
        run("-i", short, "-c:a", "libopus", "-b:a", "32k", OUT / f"short_{i:02d}.webm")
        run("-i", src, "-c:a", "libopus", "-b:a", "32k", OUT / f"full_{i:02d}.webm")
        files[i] = (OUT / f"short_{i:02d}.webm", OUT / f"full_{i:02d}.webm")
    run("-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "3", OUT / "silence.wav")
    run("-i", OUT / "silence.wav", "-c:a", "libopus", "-b:a", "32k", OUT / "silence.webm")
    run("-f", "lavfi", "-i", "anoisesrc=d=3:c=pink:a=0.02:r=16000", "-ac", "1", OUT / "roomtone.webm")
    return files


def text(model, path, vad, prompt):
    segs, _ = model.transcribe(str(path), language="fr", beam_size=5, vad_filter=vad,
                               condition_on_previous_text=False, initial_prompt=PROMPT if prompt else None)
    return " ".join(s.text.strip() for s in segs).strip()


def main():
    files = build()
    model = WhisperModel("small", device="cpu", compute_type="int8", download_root=str(ROOT / "models" / "whisper"),
                         local_files_only=True)
    for vad in (True, False):
        for prompt in (False, True):
            tag = f"small_vad{int(vad)}_prompt{int(prompt)}"
            t0 = time.perf_counter()
            shorts = {i: text(model, s, vad, prompt) for i, (s, _) in files.items()}
            fulls = {str(i): text(model, f, vad, prompt) for i, (_, f) in files.items()}
            sil = text(model, OUT / "silence.webm", vad, prompt)
            room = text(model, OUT / "roomtone.webm", vad, prompt)
            (GOLD / "transcripts" / f"{tag}_devwebm.json").write_text(json.dumps(fulls, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\n== {tag} ({time.perf_counter() - t0:.0f} s)  silence={sil!r}  roomtone={room!r}")
            for i, s in shorts.items():
                print(f"   short {i:2d}: {s!r}")


if __name__ == "__main__":
    main()
