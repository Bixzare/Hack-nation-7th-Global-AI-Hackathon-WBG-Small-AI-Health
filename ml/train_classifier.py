"""Train the tiny symptom-status classifier and export it to JSON for the browser.

Data: ml/synth/clauses_{train,dev}.jsonl (SYNTHETIC; built by ml/export_clauses.mjs from generated notes).
The gold set is never used here.
Model: char_wb n-gram TF-IDF + multinomial logistic regression (present / absent / uncertain).

Run: .venv/Scripts/python ml/train_classifier.py  -> app/web/models/symptom_clf.json
"""
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report

ROOT = Path(__file__).resolve().parent.parent
NGRAM = (2, 4)
MAX_FEATURES = 4000


def load(split):
    rows = [json.loads(l) for l in open(ROOT / f"ml/synth/clauses_{split}.jsonl", encoding="utf-8")]
    return [f"{r['symptom']} {r['clause']}" for r in rows], [r["label"] for r in rows]


def main():
    Xtr, ytr = load("train")
    Xdv, ydv = load("dev")
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=NGRAM, sublinear_tf=True, max_features=MAX_FEATURES,
                          lowercase=False)
    A = vec.fit_transform(Xtr)
    clf = LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced")
    clf.fit(A, ytr)
    print(classification_report(ydv, clf.predict(vec.transform(Xdv)), digits=3))

    vocab = {k: int(v) for k, v in vec.vocabulary_.items()}
    model = {
        "_comment": "SYNTHETIC-trained symptom-status classifier (char_wb TF-IDF + logistic regression). "
                    "Input: '<symptom> <words around the term>'. See ml/train_classifier.py.",
        "ngram": list(NGRAM), "classes": list(clf.classes_), "vocab": vocab,
        "idf": [round(float(x), 5) for x in vec.idf_],
        "coef": [[round(float(x), 5) for x in row] for row in clf.coef_],
        "intercept": [round(float(x), 5) for x in clf.intercept_],
    }
    out = ROOT / "app/web/models/symptom_clf.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"exported {out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KB, {len(vocab)} features")

    # reference predictions for the JS parity check
    probs = clf.predict_proba(vec.transform(Xdv[:50]))
    ref = [{"text": x, "label": clf.classes_[int(np.argmax(p))], "p": round(float(p.max()), 4)} for x, p in zip(Xdv[:50], probs)]
    (ROOT / "ml/synth/parity_ref.json").write_text(json.dumps(ref, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
