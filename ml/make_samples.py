"""Hosted-demo sample dictations: a few gold clips + transcripts precomputed by the LOCAL OFFLINE Whisper.

The page labels them as precomputed. Transcripts are copied, never printed. Clips are SYNTHETIC (TTS).
Run: .venv/Scripts/python ml/make_samples.py [model_tag]   (default: base)
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
OUT = ROOT / "app" / "web" / "samples"
# chosen by label only: 1 = woman 38, headache, adherence; 4 = urgent BP + chest pain; 13 = controlled, no
# symptoms; 20 = uncertain breathlessness
PICK_EN = {1: "Woman, 38: follow-up", 4: "Man, 67: very high BP", 13: "Woman, 52: BP controlled", 20: "Man, 39: uncertain symptom"}
PICK = {1: "Femme 38 ans — suivi", 4: "Homme 67 ans — TA très élevée", 13: "Femme 52 ans — TA contrôlée",
        20: "Homme 39 ans — symptôme incertain"}
MODEL_LABEL = {"base": "Whisper base (faster-whisper int8, hors ligne)",
               "small": "Whisper small (faster-whisper int8, hors ligne)"}


def main(tag="base"):
    tx = json.loads((GOLD / "transcripts" / f"{tag}_clean.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    samples = []
    for i, title in PICK.items():
        src = GOLD / "audio" / f"fr-{i}.mp3"
        dst = OUT / f"sample-{i:02d}.mp3"
        shutil.copyfile(src, dst)
        samples.append({"id": i, "title": f"{title} (voix synthétique ElevenLabs)", "title_en": f"{PICK_EN[i]} (synthetic ElevenLabs voice)", "audio": f"samples/{dst.name}",
                        "transcript": tx[str(i)], "model": MODEL_LABEL[tag], "synthetic": True})
    wfile = GOLD / "transcripts" / "small-words_dev_clean.json"  # word probabilities (speech/word_probs.py dev)
    if wfile.exists():
        words = json.loads(wfile.read_text(encoding="utf-8"))
        for s in samples:
            if str(s["id"]) in words:
                s["words"] = words[str(s["id"])]["words"]
                s["transcript"] = words[str(s["id"])]["text"]
    (OUT / "samples.json").write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(samples)} samples written ({tag}); audio {sum((OUT / s['audio'].split('/')[1]).stat().st_size for s in samples) / 1024:.0f} KB")


if __name__ == "__main__":
    main(*(sys.argv[1:] or ["base"]))
