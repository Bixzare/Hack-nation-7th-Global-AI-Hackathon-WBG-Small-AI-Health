"""Reproducible Small-AI measurements: speech model size, latency (median/p90 over 20 runs after 1 warm-up),
peak RAM; plus the in-browser extractor latency (via Node).

Run with the speech venv: .venv-speech/Scripts/python ml/measure.py [small base] [--clip data/gold/clean/fr_02.wav]
Device: whatever runs it (state it when reporting).
"""
import argparse
import json
import platform
import statistics
import subprocess
import time
from pathlib import Path

import psutil
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent


def mb(p: Path) -> float:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def measure_asr(size, clip, runs=20):
    proc = psutil.Process()
    rss0 = proc.memory_info().rss
    model = WhisperModel(size, device="cpu", compute_type="int8", download_root=str(ROOT / "models" / "whisper"),
                         local_files_only=True)
    peak = proc.memory_info().rss
    times = []
    dur = 0.0
    for i in range(runs + 1):
        t = time.perf_counter()
        segs, info = model.transcribe(str(clip), language="fr", beam_size=5, condition_on_previous_text=False)
        _ = [s.text for s in segs]
        dt = time.perf_counter() - t
        peak = max(peak, proc.memory_info().rss)
        dur = info.duration
        if i:  # first run = warm-up
            times.append(dt)
    snap = next((ROOT / "models" / "whisper").glob(f"models--Systran--faster-whisper-{size}"))
    return {"model": f"faster-whisper-{size} int8", "size_mb": round(mb(snap)), "clip_s": round(dur, 2),
            "median_s": round(statistics.median(times), 2), "p90_s": round(pct(times, 0.9), 2),
            "rtf_median": round(statistics.median(times) / dur, 2), "peak_ram_mb": round((peak - rss0) / 1e6)}


def measure_extractor():
    js = r"""
import fs from 'node:fs';
import { extract } from './app/web/engine/extractor.js';
import { checkProtocol } from './app/web/engine/rules.js';
const schema=JSON.parse(fs.readFileSync('app/web/engine/schema.json','utf8')), lex=JSON.parse(fs.readFileSync('app/web/lexicon/fr.json','utf8'));
const note='Femme de 45 ans, TA cent quatre-vingt-six sur cent douze, céphalées sévères, pas de douleur thoracique, sous amlodipine, oublie parfois son traitement, pas enceinte, RDV dans 2 semaines.';
const run=()=>{const r=extract(note,schema,lex,{source:'speech'}); checkProtocol(Object.fromEntries(Object.entries(r).map(([k,x])=>[k,x.value])));};
run(); const ts=[]; for(let i=0;i<20;i++){const t=performance.now(); run(); ts.push(performance.now()-t);} ts.sort((a,b)=>a-b);
console.log(JSON.stringify({median_ms:+ts[10].toFixed(2), p90_ms:+ts[18].toFixed(2)}));
"""
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    res = json.loads(out.stdout)
    web = ROOT / "app" / "web"
    res["engine_lexicon_kb"] = round(sum(f.stat().st_size for f in list((web / "engine").glob("*")) + [web / "lexicon" / "fr.json"]) / 1024)
    res["web_app_total_mb"] = round(mb(web), 2)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="*", default=["small", "base"])
    ap.add_argument("--clip", default=str(ROOT / "data/gold/clean/fr_02.wav"))
    a = ap.parse_args()
    print(json.dumps({"device": f"{platform.processor()} | {psutil.cpu_count(logical=False)} cores | "
                                f"{round(psutil.virtual_memory().total / 1e9)} GB RAM | {platform.system()} {platform.release()}"}))
    print(json.dumps({"extractor+rules (Node, rules-only)": measure_extractor()}))
    for m in a.models:
        print(json.dumps(measure_asr(m, Path(a.clip))))


if __name__ == "__main__":
    main()
