"""Prepare audio: gold-set clips (16 kHz mono WAV, clean + noisy copies) and Zarma reminder clips.

Gold set is TEST-ONLY and frozen: this script never reads or prints transcripts, only audio.
All gold audio is SYNTHETIC (ElevenLabs TTS, 3 male voices). Noise is synthetic too (see make_noise).

Run: .venv/Scripts/python ml/prepare_audio.py
"""
import csv
import re
import shutil
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 16000
SNR_DB = 10.0  # speech-to-noise ratio for noisy copies
NOISE_TYPES = ["fan", "street", "chatter"]
rng = np.random.default_rng(20261003)


def load(path: Path) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def save(path: Path, x: np.ndarray):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", str(path)],
                   input=pcm, check=True)


def colored(n, exponent):
    """1/f^exponent noise (1 = pink, 2 = brown)."""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    x = np.fft.irfft(spec / f ** (exponent / 2), n)
    return x / (np.abs(x).max() + 1e-9)


def make_noise(kind, n, others):
    t = np.arange(n) / SR
    if kind == "fan":  # broadband pink noise + motor hum harmonics
        x = colored(n, 1) + 0.15 * sum(np.sin(2 * np.pi * h * 100 * t) / h for h in (1, 2, 3))
    elif kind == "street":  # traffic rumble with slow swells + occasional horn
        x = colored(n, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * t + rng.uniform(0, 6)))
        for _ in range(max(1, n // (SR * 4))):
            s = rng.integers(0, max(1, n - SR // 2))
            k = np.arange(min(SR * 2 // 5, n - s)) / SR
            x[s:s + len(k)] += 0.5 * (np.sin(2 * np.pi * 420 * k) + np.sin(2 * np.pi * 520 * k))
    else:  # chatter: babble from 4 other (reversed, unintelligible) synthetic voices
        x = np.zeros(n, dtype=np.float32)
        for o in rng.choice(len(others), 4, replace=False):
            v = others[o][::-1]
            v = np.tile(v, int(np.ceil(n / len(v))) + 1)
            off = rng.integers(0, len(v) - n)
            x += v[off:off + n]
    return x.astype(np.float32)


def mix(speech, noise, snr_db):
    ps, pn = np.mean(speech ** 2), np.mean(noise ** 2) + 1e-12
    y = speech + noise * np.sqrt(ps / (pn * 10 ** (snr_db / 10)))
    return y / max(1.0, np.abs(y).max() / 0.98)


def prepare_gold():
    labels = list(csv.DictReader(open(GOLD / "gold_labels.csv", encoding="utf-8")))
    src = {int(re.search(r"(\d+)", p.stem).group(1)): p for p in (GOLD / "audio").glob("fr-*.mp3")}
    clean = {}
    rows = []
    for row in labels:
        i = int(row["id"])
        stem = Path(row["file"]).stem  # fr_01 etc.
        x = load(src[i])
        save(GOLD / "clean" / f"{stem}.wav", x)
        clean[i] = (stem, x)
    others = [x for _, x in clean.values()]
    for row in labels:
        i = int(row["id"])
        stem, x = clean[i]
        noisy = kind = ""
        if i % 2 == 0:  # 15 of 30 clips get a noisy copy; originals are kept
            kind = NOISE_TYPES[(i // 2) % 3]
            save(GOLD / "noisy" / f"{stem}.wav", mix(x, make_noise(kind, len(x), others), SNR_DB))
            noisy = f"noisy/{stem}.wav"
        rows.append({"id": i, "label_file": row["file"], "source_mp3": f"audio/{src[i].name}",
                     "clean_wav": f"clean/{stem}.wav", "noisy_wav": noisy, "noise": kind,
                     "snr_db": SNR_DB if kind else "", "seconds": round(len(x) / SR, 2)})
    with open(GOLD / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"gold: {len(rows)} clean, {sum(1 for r in rows if r['noisy_wav'])} noisy, "
          f"{sum(r['seconds'] for r in rows):.0f} s total")


def prepare_zarma():
    """locales/dje/dje_<code>.mp3 (and the dji_mon.mp3 typo) -> app/web/audio/dje/<code>.mp3"""
    out = ROOT / "app" / "web" / "audio" / "dje"
    out.mkdir(parents=True, exist_ok=True)
    found = {}
    for p in (ROOT / "locales" / "dje").glob("*.mp3"):
        code = re.sub(r"^dj[ei]_", "", p.stem)
        shutil.copyfile(p, out / f"{code}.mp3")
        found[code] = p.name
    print("zarma:", ", ".join(f"{v} -> {k}.mp3" for k, v in sorted(found.items())))


if __name__ == "__main__":
    prepare_gold()
    prepare_zarma()
