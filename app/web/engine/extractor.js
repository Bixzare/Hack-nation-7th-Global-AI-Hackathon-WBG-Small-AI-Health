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
  let s = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[’']/g, " ").replace(/\s+/g, " ");
  return wordsToDigits(s, lex.numbers);
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

// ---------- main ----------
// opts: { source: "typed" | "speech", classifier: (clauseText, symptom) => {status, conf} | null }
export function extract(text, schema, lex, opts = {}) {
  const source = opts.source || "typed";
  const rec = emptyRecord(schema);
  const norm = normalize(text, lex);
  const cls = clauses(norm, lex);
  const set = (name, value, conf, extraCheck = false) => {
    if (!rec[name]) return;
    rec[name] = { value, confidence: conf, source, check: conf < CHECK_BELOW || extraCheck };
  };

  // sex: strong cues (sex words) outweigh weak ones (grammatical agreement); tie -> unknown (check)
  const score = { F: 0, M: 0 }, strong = { F: 0, M: 0 };
  for (const k of ["F", "M"]) {
    for (const p of lex.sex[k].strong) if (new RegExp(p).test(norm)) { score[k] += 3; strong[k]++; }
    for (const p of lex.sex[k].weak) if (new RegExp(p).test(norm)) score[k] += 1;
  }
  if (score.F !== score.M) {
    const win = score.F > score.M ? "F" : "M", lose = win === "F" ? "M" : "F";
    set("sex", win, strong[win] && !strong[lose] ? 0.9 : 0.6);
  } else set("sex", "unknown", 0.3);

  // age
  for (const p of lex.age) { const m = new RegExp(p).exec(norm); if (m) { set("age", Number(m[1]), 0.9, source === "speech"); break; } }

  // blood pressure: every number pair in order; first -> bp1, second -> bp2. Speech numbers are ALWAYS checked.
  const bps = [];
  for (const p of lex.bp.patterns) for (const m of norm.matchAll(new RegExp(p, "g"))) bps.push({ i: m.index, s: +m[1], d: +m[2] });
  bps.sort((a, b) => a.i - b.i);
  bps.slice(0, 2).forEach((bp, k) => {
    let { s, d } = bp, conf = 0.9;
    if (s <= lex.bp.cmhg_below && d <= lex.bp.cmhg_below) { s *= 10; d *= 10; conf = 0.6; } // "16/9" = cmHg
    const [smin, smax] = lex.bp.plausible.sys, [dmin, dmax] = lex.bp.plausible.dia;
    if (s < smin || s > smax || d < dmin || d > dmax || d >= s) conf = 0.3;
    set(`bp${k + 1}_sys`, s, conf, source === "speech");
    set(`bp${k + 1}_dia`, d, conf, source === "speech");
  });

  // symptoms
  const allNone = any(lex.symptoms_none, norm);
  for (const sym of SYMPTOMS) {
    const found = [];
    let neg = false; // negation carried by list continuers ("pas de X, ni de Y")
    for (const c of cls) {
      const cont = lex.list_continuers.some(w => c.text.startsWith(w + " "));
      for (const p of lex.symptoms[sym]) {
        const m = new RegExp(p).exec(c.text);
        if (!m) continue;
        let r = ruleStatus(c, m.index, m[0].length, lex, cont && neg);
        if (opts.classifier) r = combine(r, opts.classifier(c.text, sym));
        found.push(r);
        break;
      }
      neg = any(lex.negation_pre, c.text) || (cont && neg);
    }
    if (found.length) {
      const statuses = new Set(found.map(f => f.status));
      if (statuses.size === 1) set(sym, found[0].status, Math.min(...found.map(f => f.conf)), found[0].status === "uncertain");
      else set(sym, "uncertain", 0.4, true); // conflicting mentions: ask the health worker
    } else if (allNone) set(sym, "absent", 0.8);
    else set(sym, "not_mentioned", 0.9);
  }

  // closed-value fields from ordered pattern lists
  const pick = name => {
    const f = lex.fields[name];
    for (const v of f.order) if (any(f[v], norm)) return v;
    return null;
  };
  const onMeds = pick("on_meds");
  set("on_meds", onMeds ?? "not_mentioned", onMeds ? 0.85 : 0.9);
  const miss = pick("missed_doses");
  if (onMeds === "no") set("missed_doses", "na", 0.85);
  else set("missed_doses", miss ?? "not_mentioned", miss ? 0.8 : 0.9);

  const sex = rec.sex.value;
  const preg = pick("pregnancy");
  if (preg === "pregnant" && sex !== "F") set("sex", "F", 0.7);
  if (rec.sex.value === "M") set("pregnancy", "na", 0.9);
  else set("pregnancy", preg ?? "not_mentioned", preg ? 0.85 : (rec.sex.value === "F" ? 0.9 : 0.5));

  const couns = pick("counselling");
  set("counselling", couns ?? "not_mentioned", couns ? 0.8 : 0.9);
  const ref = pick("referral");
  set("referral", ref ?? "not_mentioned", ref ? 0.8 : 0.9);

  set("follow_up", followUp(norm, lex.follow_up) ?? "not_mentioned", 0.85);
  return rec;
}

function followUp(norm, fu) {
  for (const [p, v] of Object.entries(fu.phrases)) if (norm.includes(p)) return v;
  for (const pat of [fu.pattern, fu.bare_pattern]) {
    const m = new RegExp(pat).exec(norm);
    if (!m) continue;
    const n = Number(m[1]), unit = fu.units[m[2]];
    if (unit === "D") return fu.day_map[String(n)] ?? `P${n}D`;
    return `P${n}${unit}`;
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
