"""Gold split, typed texts and WER. Prints numbers only, never gold text.

1. Split: dev = clips 1, 4, 13, 20 (already seen) + 6 drawn with random.Random(2026) from the rest.
   Test = the other 20, frozen. Written to data/gold/split.json.
2. Typed texts: parsed from RECORDING-SCRIPT.md (Part 2 table) -> data/gold/transcripts/typed.json.
3. WER of every transcript file against the script text, per split and per condition.

Run: .venv/Scripts/python ml/gold_split_wer.py
"""
import json
import random
import re
import shutil
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
SCRIPT_SRC = ROOT / "locales" / "dje" / "RECORDING-SCRIPT.md"


def make_split():
    seen = [1, 4, 13, 20]
    rest = [i for i in range(1, 31) if i not in seen]
    dev = sorted(seen + random.Random(2026).sample(rest, 6))
    test = [i for i in range(1, 31) if i not in dev]
    (GOLD / "split.json").write_text(json.dumps({"dev": dev, "test": test, "seed": 2026}), encoding="utf-8")
    return dev, test


def parse_script():
    dst = GOLD / "RECORDING-SCRIPT.md"
    if not dst.exists():
        shutil.copyfile(SCRIPT_SRC, dst)
    texts = {}
    for line in dst.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*fr_(\d{2})\s*\|\s*(.+?)\s*\|\s*$", line)
        if m:
            texts[str(int(m.group(1)))] = m.group(2)
    (GOLD / "transcripts" / "typed.json").write_text(json.dumps(texts, ensure_ascii=False, indent=1), encoding="utf-8")
    return texts


def words(s):
    s = unicodedata.normalize("NFC", s.lower()).replace("’", "'")
    s = re.sub(r"[^\w'/ -]", " ", s)
    s = s.replace("/", " sur ").replace("-", " ").replace("'", " ")
    return s.split()


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)], len(r)


def main():
    dev, test = make_split()
    ref = parse_script()
    print(f"split: dev={len(dev)} clips, test={len(test)} clips (seed 2026); typed texts parsed: {len(ref)}")
    for f in sorted((GOLD / "transcripts").glob("*.json")):
        if f.stem == "typed":
            continue
        hyp = json.loads(f.read_text(encoding="utf-8"))
        out = []
        for name, ids in [("all", range(1, 31)), ("test", test), ("dev", dev)]:
            e = n = 0
            for i in ids:
                if str(i) in hyp:
                    a, b = wer(ref[str(i)], hyp[str(i)])
                    e += a
                    n += b
            if n:
                out.append(f"{name} {100 * e / n:5.1f}%")
        print(f"WER {f.stem:20s} " + " | ".join(out))


if __name__ == "__main__":
    main()
