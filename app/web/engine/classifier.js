// Tiny symptom-status classifier (multinomial logistic regression on char n-grams of the clause).
// Trained in ml/train_classifier.py, exported to JSON; inference here must match the Python featurizer:
// sklearn TfidfVectorizer(analyzer="char_wb", ngram_range=(lo, hi), lowercase) with sublinear_tf + l2 norm.

export function loadClassifier(model) {
  if (!model) return null;
  const vocab = new Map(Object.entries(model.vocab));
  return (clauseText, symptom) => {
    const text = `${symptom} ${clauseText}`; // symptom token lets one model serve all four symptoms
    const counts = new Map();
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const w = ` ${word} `;
      for (let n = model.ngram[0]; n <= model.ngram[1]; n++) { // mirrors sklearn _char_wb_ngrams exactly
        let off = 0;
        const add = g => { const j = vocab.get(g); if (j !== undefined) counts.set(j, (counts.get(j) || 0) + 1); };
        add(w.slice(0, n));
        while (off + n < w.length) { off++; add(w.slice(off, off + n)); }
        if (off === 0) break;
      }
    }
    let norm = 0;
    const feats = [];
    for (const [j, c] of counts) { const v = (1 + Math.log(c)) * model.idf[j]; feats.push([j, v]); norm += v * v; }
    norm = Math.sqrt(norm) || 1;
    const logits = model.intercept.slice();
    for (const [j, v] of feats) for (let k = 0; k < logits.length; k++) logits[k] += model.coef[k][j] * (v / norm);
    const mx = Math.max(...logits), ex = logits.map(z => Math.exp(z - mx)), sum = ex.reduce((a, b) => a + b, 0);
    let best = 0;
    for (let k = 1; k < ex.length; k++) if (ex[k] > ex[best]) best = k;
    return { status: model.classes[best], conf: ex[best] / sum };
  };
}
