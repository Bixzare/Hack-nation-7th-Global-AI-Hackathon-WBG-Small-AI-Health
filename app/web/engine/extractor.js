// Note -> fixed record. Language-neutral engine: every word it knows comes from a lexicon JSON
// (lexicon/<locale>.json), and the optional symptom classifier from model JSON (ml/ exports it).
// Runs in the browser and in Node (ml/eval.mjs) unchanged.

export const SYMPTOMS = ["headache", "chest_pain", "blurred_vision", "breathless"];
const CHECK_BELOW = 0.7; // fields below this confidence are marked "please check"

export function emptyRecord(schema) {
  const rec = {};
  for (const [name, spec] of Object.entries(schema.fields)) {
    rec[name] = { value: spec.default ?? null, confidence: 0, source: null, check: !spec.optional };
  }
  return rec;
}

// ---------- normalization ----------
export function normalize(text, lex) {
  return normalizeWithCorrections(text, lex).text;
}

// Same as normalize, plus the set of canonical words that were produced by a CORRECTION (fuzzy spelling
// or phonetic sound-alike). Fields whose evidence contains a corrected word are always "please check".
export function normalizeWithCorrections(text, lex) {
  let s = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[’']/g, " ").replace(/\s+/g, " ");
  s = wordsToDigits(s, lex.numbers);
  const corrected = new Set();
  if (lex.fuzzy) s = fuzzyRewrite(s, lex.fuzzy, corrected);
  if (lex.phonetic) s = phoneticRewrite(s, lex.phonetic, corrected);
  return { text: s, corrected };
}

// French phonetic key from lexicon rules (ph->f, c before e/i->s, emm->am, silent endings...).
export function phoneticKey(w, ph) {
  let k = w;
  for (const [re, rep] of ph.rules) k = k.replace(new RegExp(re, "g"), rep);
  return k;
}

// Rewrite a word (or two adjacent words) whose phonetic key equals a clinical term's key, e.g.
// "fam" -> "femme", "s effaler" -> "cephalees". Protected everyday words are never rewritten.
export function phoneticRewrite(s, ph, corrected = new Set()) {
  const keys = new Map(ph.terms.map(t => [phoneticKey(t, ph), t]));
  const protect = new Set([...ph.protect, ...ph.terms]);
  const toks = s.split(/(\s+)/);
  const word = x => /^[a-z]+$/.test(x || "");
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (!word(w) || protect.has(w)) continue;
    const j = i + 2; // next word (toks[i+1] is the space)
    if (word(toks[j]) && !protect.has(toks[j]) && (w + toks[j]).length >= ph.min_len) {
      const t2 = keys.get(phoneticKey(w + toks[j], ph));
      if (t2) { toks[i] = t2; toks[i + 1] = ""; toks[j] = ""; corrected.add(t2); continue; }
    }
    if (w.length < ph.min_len) continue;
    const t = keys.get(phoneticKey(w, ph));
    if (t) { toks[i] = t; corrected.add(t); }
  }
  return toks.join("").replace(/\s+/g, " ").trim();
}

// ASR-tolerant spelling: rewrite a word to a canonical lexicon term when it is within edit distance
// 1 (length 5-7) or 2 (length >= 8) and starts with the same letter. Rewrites are reported in `corrected`.
export function fuzzyRewrite(s, fz, corrected = new Set()) {
  const canon = new Set(fz.terms);
  return s.replace(/[a-z]+/g, w => {
    if (w.length < fz.min_len || canon.has(w)) return w;
    let best = null, bestD = Infinity;
    for (const c of fz.terms) {
      if (c[0] !== w[0] || Math.abs(c.length - w.length) > 2) continue;
      const max = Math.max(c.length, w.length) >= 8 ? 2 : 1;
      const d = editDistance(w, c, max);
      if (d <= max && d < bestD) { best = c; bestD = d; }
    }
    if (best) corrected.add(best);
    return best ?? w;
  });
}

function editDistance(a, b, max) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return Infinity;
    prev = cur;
  }
  return prev[b.length];
}

// Converts runs of number words to digits: "cent soixante-deux" -> "162".
export function wordsToDigits(s, nums) {
  for (const [pat, v] of Object.entries(nums.compounds)) s = s.replace(new RegExp(`\\b${pat}\\b`, "g"), ` ${v} `);
  const isNum = w => w in nums.words || w in nums.multipliers || /^\d+$/.test(w);
  const tokens = s.split(/(\s+|-|[.,;:!?()])/);
  const out = [];
  let run = [];
  const flush = () => {
    const words = run.filter(t => t.trim() && t !== "-");
    if (words.length) {
      if (words.length === 1 && /^\d+$/.test(words[0])) out.push(words[0]);
      else out.push(String(evalRun(words, nums)));
    }
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.trim() || t === "-") { if (run.length) run.push(t); else out.push(t); continue; }
    if (/^[.,;:!?()]$/.test(t)) { const trailing = []; while (run.length && (!run.at(-1).trim() || run.at(-1) === "-")) trailing.unshift(run.pop()); flush(); out.push(...trailing, t); continue; }
    const joiner = nums.joiners.includes(t) && run.length && isNum(nextWord(tokens, i));
    if (isNum(t) || joiner) run.push(t);
    else { const trailing = []; while (run.length && (!run.at(-1).trim() || run.at(-1) === "-")) trailing.unshift(run.pop()); flush(); out.push(...trailing, t); }
  }
  flush();
  return out.join("").replace(/\s+/g, " ").trim();
}

function nextWord(tokens, i) {
  for (let j = i + 1; j < tokens.length; j++) if (tokens[j].trim() && tokens[j] !== "-") return tokens[j];
  return "";
}

function evalRun(words, nums) {
  let total = 0, cur = 0;
  for (const w of words) {
    if (nums.joiners.includes(w)) continue;
    if (w in nums.multipliers) {
      const m = nums.multipliers[w];
      if (m >= 1000) { total += (cur || 1) * m; cur = 0; } else cur = (cur || 1) * m;
    } else cur += /^\d+$/.test(w) ? Number(w) : nums.words[w];
  }
  return total + cur;
}

// ---------- clause handling ----------
function clauses(norm, lex) {
  const parts = [];
  const re = new RegExp(lex.clause_split, "g");
  let last = 0, m;
  while ((m = re.exec(norm))) {
    parts.push({ text: norm.slice(last, m.index), end: m[0] });
    last = m.index + m[0].length;
    if (m[0] === "") re.lastIndex++;
  }
  parts.push({ text: norm.slice(last), end: "" });
  return parts.map(p => ({ text: p.text.trim(), question: p.end === "?" })).filter(p => p.text);
}

const any = (pats, s) => pats.some(p => new RegExp(p).test(s));
const firstIndex = (pats, s) => Math.min(...pats.map(p => { const m = new RegExp(p).exec(s); return m ? m.index : Infinity; }));

// Rule-based status of one symptom mention: NegEx-style cues within a few words of the term.
const lastWords = (s, n) => s.trim().split(/\s+/).slice(-n).join(" ");
const firstWords = (s, n) => s.trim().split(/\s+/).slice(0, n).join(" ");
export function ruleStatus(clause, termIdx, termLen, lex, inheritNeg) {
  const w = lex.scope_words;
  const before = clause.text.slice(0, termIdx), after = clause.text.slice(termIdx + termLen);
  const term = clause.text.slice(termIdx, termIdx + termLen);
  const uncWindow = `${lastWords(before, w.unc_pre)} ${term} ${firstWords(after, w.unc_post)}`;
  const nearEnd = after.trim().split(/\s+/).filter(Boolean).length <= 6;
  if ((clause.question && nearEnd) || any(lex.uncertainty, uncWindow)) return { status: "uncertain", conf: 0.5 };
  if (any(lex.negation_pre, lastWords(before, w.neg_pre)) || any(lex.negation_post, firstWords(after, w.neg_post)) || inheritNeg)
    return { status: "absent", conf: 0.85 };
  return { status: "present", conf: 0.85 };
}

// Symptom mentions with their (normalized) clause: used to build classifier training data in ml/.
// Classifier input: a few words around the symptom term (same function for training and inference).
export function termWindow(clause, idx, len) {
  return `${lastWords(clause.text.slice(0, idx), 6)} ${clause.text.slice(idx, idx + len)} ${firstWords(clause.text.slice(idx + len), 4)}${clause.question ? " ?" : ""}`.trim();
}

export function mentions(text, lex) {
  const out = [];
  for (const c of clauses(normalize(text, lex), lex)) for (const sym of SYMPTOMS)
    for (const p of lex.symptoms[sym]) {
      const m = new RegExp(p).exec(c.text);
      if (m) { out.push({ symptom: sym, clause: termWindow(c, m.index, m[0].length) }); break; }
    }
  return out;
}

// ---------- main ----------
// opts: { source: "typed" | "speech", classifier: (clauseText, symptom) => {status, conf} | null }
export function extract(text, schema, lex, opts = {}) {
  const source = opts.source || "typed";
  const rec = emptyRecord(schema);
  const { text: norm, corrected } = normalizeWithCorrections(text, lex);
  const cls = clauses(norm, lex);
  // Suspect words: produced by a correction, or heard with low ASR confidence (opts.lowConf = raw words from
  // the speech service below the threshold). A field whose evidence contains one is always "please check".
  const lowConf = new Set();
  for (const w of opts.lowConf || []) for (const tok of normalize(w, lex).split(/[^a-z0-9]+/)) if (tok) lowConf.add(tok);
  const evidence = {};
  const set = (name, value, conf, extraCheck = false, ev = null) => {
    if (!rec[name]) return;
    rec[name] = { value, confidence: conf, source, check: conf < CHECK_BELOW || extraCheck };
    if (ev) evidence[name] = ev;
  };

  // sex: strong cues (sex words) outweigh weak ones (grammatical agreement); tie -> unknown (check)
  const score = { F: 0, M: 0 }, strong = { F: 0, M: 0 }, sexEv = { F: [], M: [] };
  for (const k of ["F", "M"]) {
    for (const p of lex.sex[k].strong) { const m = new RegExp(p).exec(norm); if (m) { score[k] += 3; strong[k]++; sexEv[k].push(m[0]); } }
    for (const p of lex.sex[k].weak) { const m = new RegExp(p).exec(norm); if (m) { score[k] += 1; sexEv[k].push(m[0]); } }
  }
  if (score.F !== score.M) {
    const win = score.F > score.M ? "F" : "M", lose = win === "F" ? "M" : "F";
    set("sex", win, strong[win] && !strong[lose] ? 0.9 : 0.6, false, sexEv[win].join(" "));
  } else set("sex", "unknown", 0.3);

  // age
  for (const p of lex.age) { const m = new RegExp(p).exec(norm); if (m) { set("age", Number(m[1]), 0.9, source === "speech", m[0]); break; } }

  // blood pressure: every number pair in order; first -> bp1, second -> bp2. Speech numbers are ALWAYS checked.
  const bps = [];
  for (const p of lex.bp.patterns) for (const m of norm.matchAll(new RegExp(p, "g")))
    if (+m[1] >= (lex.bp.min_sys ?? 0)) bps.push({ i: m.index, s: +m[1], d: +m[2], ev: m[0] }); // skip dates like 12/10
  // cmHg shorthand ("TA 16/9") is accepted only right after a BP word (lexicon cmhg_pattern)
  if (lex.bp.cmhg_pattern) for (const m of norm.matchAll(new RegExp(lex.bp.cmhg_pattern, "g")))
    if (+m[1] <= lex.bp.cmhg_below && +m[2] <= lex.bp.cmhg_below) bps.push({ i: m.index, s: +m[1] * 10, d: +m[2] * 10, cmhg: true, ev: m[0] });
  bps.sort((a, b) => a.i - b.i);
  bps.slice(0, 2).forEach((bp, k) => {
    let { s, d } = bp, conf = bp.cmhg ? 0.6 : 0.9; // cmHg conversion is always "please check"
    const [smin, smax] = lex.bp.plausible.sys, [dmin, dmax] = lex.bp.plausible.dia;
    if (s < smin || s > smax || d < dmin || d > dmax || d >= s) conf = 0.3;
    set(`bp${k + 1}_sys`, s, conf, source === "speech", bp.ev);
    set(`bp${k + 1}_dia`, d, conf, source === "speech", bp.ev);
  });

  // symptoms
  const allNone = any(lex.symptoms_none, norm);
  for (const sym of SYMPTOMS) {
    const found = [], symEv = [];
    let variant = false; // matched through an ASR sound-alike pattern -> always "please check"
    let neg = false; // negation carried by list continuers ("pas de X, ni de Y")
    const pats = [...lex.symptoms[sym].map(p => [p, false]), ...(lex.asr_variants?.[sym] || []).map(p => [p, true])];
    for (const c of cls) {
      const cont = lex.list_continuers.some(w => c.text.startsWith(w + " "));
      for (const [p, isVariant] of pats) {
        const m = new RegExp(p).exec(c.text);
        if (!m) continue;
        let r = ruleStatus(c, m.index, m[0].length, lex, cont && neg);
        if (opts.classifier) r = combine(r, opts.classifier(termWindow(c, m.index, m[0].length), sym));
        found.push(r);
        symEv.push(`${lastWords(c.text.slice(0, m.index), lex.scope_words.neg_pre)} ${m[0]}`);
        variant ||= isVariant;
        break;
      }
      neg = any(lex.negation_pre, c.text) || (cont && neg);
    }
    if (found.length) {
      const statuses = new Set(found.map(f => f.status));
      if (statuses.size === 1) set(sym, found[0].status, Math.min(...found.map(f => f.conf)), found[0].status === "uncertain" || variant, symEv.join(" "));
      else set(sym, "uncertain", 0.4, true, symEv.join(" ")); // conflicting mentions: ask the health worker
      if (variant) rec[sym].reason = "sound_alike";
    } else if (allNone) set(sym, "absent", 0.8);
    else set(sym, "not_mentioned", 0.9);
  }

  // closed-value fields from ordered pattern lists
  const pickEv = {};
  const pick = name => {
    const f = lex.fields[name];
    // lexicon classes may alias a record value (e.g. "poor" adherence -> missed_doses "yes")
    for (const v of f.order) for (const p of f[v]) { const m = new RegExp(p).exec(norm); if (m) { pickEv[name] = m[0]; return f.alias?.[v] ?? v; } }
    return null;
  };
  const onMeds = pick("on_meds");
  set("on_meds", onMeds ?? "not_mentioned", onMeds ? 0.85 : 0.9, false, pickEv.on_meds);
  const miss = pick("missed_doses");
  if (onMeds === "no") set("missed_doses", "na", 0.85, false, pickEv.on_meds);
  else set("missed_doses", miss ?? "not_mentioned", miss ? 0.8 : 0.9, false, pickEv.missed_doses);

  const sex = rec.sex.value;
  const preg = pick("pregnancy");
  if (preg === "pregnant" && sex !== "F") set("sex", "F", 0.7);
  if (rec.sex.value === "M") set("pregnancy", "na", 0.9);
  else set("pregnancy", preg ?? "not_mentioned", preg ? 0.85 : (rec.sex.value === "F" ? 0.9 : 0.5), false, pickEv.pregnancy);

  const couns = pick("counselling");
  set("counselling", couns ?? "not_mentioned", couns ? 0.8 : 0.9, false, pickEv.counselling);
  const ref = pick("referral");
  set("referral", ref ?? "not_mentioned", ref ? 0.8 : 0.9, false, pickEv.referral);

  const fu = followUp(norm, lex.follow_up);
  set("follow_up", fu?.value ?? "not_mentioned", 0.85, false, fu?.ev);

  // Corrected or low-confidence words never fill a field silently.
  for (const [name, ev] of Object.entries(evidence)) {
    const toks = ev.split(/[^a-z0-9]+/).filter(Boolean);
    const why = toks.some(t => corrected.has(t)) ? "corrected" : toks.some(t => lowConf.has(t)) ? "low_asr_confidence" : null;
    if (why && rec[name]) { rec[name].check = true; rec[name].reason ??= why; }
  }
  return rec;
}

function followUp(norm, fu) {
  for (const [p, v] of Object.entries(fu.phrases)) if (norm.includes(p)) return { value: v, ev: p };
  for (const pat of [fu.pattern, fu.bare_pattern]) {
    const m = new RegExp(pat).exec(norm);
    if (!m) continue;
    const n = Number(m[1]), unit = fu.units[m[2]];
    if (unit === "D") return { value: fu.day_map[String(n)] ?? `P${n}D`, ev: m[0] };
    return { value: `P${n}${unit}`, ev: m[0] };
  }
  return null;
}

// Rules + classifier: agree -> keep (higher confidence); disagree -> trust the more confident one,
// but anything uncertain or low-confidence stays "please check".
function combine(rule, clf) {
  if (!clf) return rule;
  if (clf.status === rule.status) return { status: rule.status, conf: Math.max(rule.conf, clf.conf) };
  return clf.conf > rule.conf ? { status: clf.status, conf: clf.conf * 0.8 } : { status: rule.status, conf: rule.conf * 0.8 };
}
