"""Distance test on gold DEV clips: attenuate by 30 dB (phone far from the mouth), then transcribe with and
without loudness normalisation. Prints transcripts of DEV clips (allowed) and mean volume."""
import json, re, subprocess, tempfile
from pathlib import Path
import imageio_ffmpeg
from faster_whisper import WhisperModel
ROOT = Path(__file__).resolve().parent.parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
def run(*a): return subprocess.run([FF, "-hide_banner", *map(str, a)], capture_output=True, text=True)
def mean_db(p): m = re.search(r"mean_volume: (-?[\d.]+) dB", run("-i", p, "-af", "volumedetect", "-f", "null", "-").stderr); return float(m.group(1)) if m else None
m = WhisperModel("small", device="cpu", compute_type="int8", download_root=str(ROOT / "models/whisper"), local_files_only=True)
tx = lambda p: " ".join(s.text.strip() for s in m.transcribe(str(p), language="fr", beam_size=5, vad_filter=True, condition_on_previous_text=False)[0]).strip()
with tempfile.TemporaryDirectory() as t:
    for i in (1, 14, 21):
        src = ROOT / f"data/gold/clean/fr_{i:02d}.wav"
        q = Path(t) / f"q{i}.webm"; run("-y", "-i", src, "-af", "volume=-30dB", "-c:a", "libopus", "-b:a", "32k", q)
        ln = Path(t) / f"ln{i}.wav"; run("-y", "-i", q, "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-ar", "16000", "-ac", "1", ln)
        print(f"dev {i}: orig {mean_db(src)} dB, quiet {mean_db(q)} dB\n  quiet raw : {tx(q)!r}\n  quiet+norm: {tx(ln)!r}")
