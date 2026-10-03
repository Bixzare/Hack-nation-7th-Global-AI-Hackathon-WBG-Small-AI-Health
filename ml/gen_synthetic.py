"""Generate SYNTHETIC French hypertension visit notes with labels (train + dev).

Written from general French clinical-note conventions only. The gold set (data/gold) is never read
here: it is test-only and frozen. Labels follow the gold CSV conventions:
  symptoms: present / absent / uncertain / not_mentioned
  on_meds: yes / no / not_mentioned; missed_doses: yes / no / sometimes / na / not_mentioned
  pregnancy: pregnant / not_pregnant / na / not_mentioned; counselling, referral: yes / not_mentioned
  follow_up: "<n> <unit>" or not_mentioned

Run: .venv/Scripts/python ml/gen_synthetic.py  -> ml/synth/{train,dev}.jsonl
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent / "synth"
SYMPTOMS = ["headache", "chest_pain", "blurred_vision", "breathless"]

TERMS = {
    "headache": ["céphalées", "des céphalées", "maux de tête", "mal de tête", "des maux de tête", "céphalée"],
    "chest_pain": ["douleur thoracique", "douleurs thoraciques", "DT", "mal à la poitrine", "douleur à la poitrine"],
    "blurred_vision": ["vision floue", "flou visuel", "troubles visuels", "baisse de la vue", "vue trouble"],
    "breathless": ["dyspnée", "essoufflement", "souffle court", "difficulté à respirer", "gêne respiratoire"],
}
PRESENT = ["{t}", "se plaint de {t}", "signale {t}", "présente {t}", "rapporte {t}", "{t} depuis {d}",
           "{t} ++", "a {t}", "{t} présente", "plainte de {t}"]
ABSENT = ["pas de {t}", "pas {t}", "aucune {t}", "sans {t}", "nie {t}", "absence de {t}", "{t} : non",
          "{t} négatif", "pas de {t} signalée", "ne signale pas de {t}"]
UNCERTAIN = ["{t} ?", "peut-être {t}", "{t} à préciser", "{t} douteuse", "possible {t}", "{t} non certaine",
             "parle vaguement de {t}", "pas sûr pour {t}", "{t} incertaine", "{t} ? à revoir"]
DURATION = ["2 jours", "trois jours", "une semaine", "quelques jours", "hier"]
NONE_ALL = ["pas de symptômes", "pas de plaintes", "asymptomatique", "aucune plainte", "RAS sur le plan clinique"]

MEDS = ["amlodipine", "hydrochlorothiazide", "HCTZ", "losartan", "énalapril", "nifédipine", "captopril"]
ON_YES = ["sous traitement", "sous {m}", "sous {m} 5 mg", "prend son traitement", "traité{e} par {m}",
          "sous antihypertenseur", "traitement en cours par {m}"]
ON_NO = ["pas de traitement", "sans traitement", "non traité{e}", "jamais traité{e}", "pas sous traitement",
         "aucun traitement en cours", "n'a jamais pris de traitement"]
MISS = {
    "yes": ["oublie souvent son traitement", "mauvaise observance", "a arrêté son traitement",
            "n'a pas pris ses médicaments depuis une semaine", "observance mauvaise", "oublis fréquents",
            "rupture de traitement"],
    "no": ["bonne observance", "observant{e}", "n'oublie pas ses prises", "pas d'oubli", "prend bien son traitement",
           "observance correcte", "aucun oubli"],
    "sometimes": ["oublie parfois", "oublis occasionnels", "oublie de temps en temps", "quelques oublis",
                  "oublie parfois sa prise du soir", "observance moyenne, oublis ponctuels"],
}
PREG = {
    "pregnant": ["enceinte", "grossesse en cours", "enceinte de 5 mois", "grossesse de 24 SA", "patiente enceinte"],
    "not_pregnant": ["pas enceinte", "non enceinte", "pas de grossesse", "test de grossesse négatif",
                     "grossesse exclue", "ménopausée"],
}
COUNSEL = ["conseils hygiéno-diététiques donnés", "conseils donnés sur le sel", "régime pauvre en sel conseillé",
           "conseillé de réduire le sel", "éducation sur la maladie faite", "conseils sur l'activité physique",
           "sensibilisation faite"]
REFER = ["référé{e} à l'hôpital", "référé{e} au CHR", "à référer en urgence", "évacuation vers l'hôpital",
         "orienté{e} vers le médecin", "transfert à l'hôpital de district", "référence faite"]
FOLLOW = {
    "1 week": ["RDV dans 1 semaine", "revoir dans une semaine", "contrôle dans 8 jours", "RDV dans huit jours",
               "à revoir dans 7 jours"],
    "2 weeks": ["RDV dans 2 semaines", "revoir dans deux semaines", "contrôle dans 15 jours",
                "RDV dans quinze jours", "à revoir dans 14 jours"],
    "1 month": ["RDV dans 1 mois", "revoir dans un mois", "contrôle dans un mois", "RDV le mois prochain"],
    "3 months": ["RDV dans 3 mois", "revoir dans trois mois", "contrôle dans 3 mois"],
    "6 months": ["RDV dans 6 mois", "revoir dans six mois", "contrôle dans 6 mois"],
}
UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
         "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
TENS = {20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante", 80: "quatre-vingt"}


def fr_number(n: int) -> str:
    """French number words for 0..299 (enough for ages and BP)."""
    if n >= 100:
        h, r = divmod(n, 100)
        head = "cent" if h == 1 else f"{UNITS[h]} cent" + ("s" if n % 100 == 0 else "")
        return head if r == 0 else f"{head} {fr_number(r)}"
    if n < 20:
        return UNITS[n]
    if 70 <= n < 80:
        return "soixante-" + ("et-onze" if n == 71 else UNITS[n - 60])
    if n >= 90:
        return "quatre-vingt-" + UNITS[n - 80]
    t, u = divmod(n, 10)
    base = TENS[t * 10]
    if u == 0:
        return base + ("s" if t == 8 else "")
    return base + ("-et-un" if u == 1 and t != 8 else "-" + UNITS[u])


def num(n, rng, words_p):
    return fr_number(n) if rng.random() < words_p else str(n)


def bp_text(s, d, rng, words_p):
    if rng.random() < words_p:
        return f"{fr_number(s)} sur {fr_number(d)}"
    sep = rng.choice(["/", "/", " sur ", "/"])
    return f"{s}{sep}{d}"


def make_example(rng: random.Random, words_p: float):
    lab = {}
    female = rng.random() < 0.5
    lab["sex"] = "F" if female else "M"
    E = "e" if female else ""
    lab["age"] = rng.randint(25, 80)
    sys_ = rng.choice([rng.randint(118, 139), rng.randint(140, 159), rng.randint(160, 179), rng.randint(180, 205)])
    dia = max(70, min(125, int(sys_ * rng.uniform(0.55, 0.65))))
    lab["bp1"] = f"{sys_}/{dia}"
    lab["bp2"] = ""
    parts = []

    # opener
    sex_word = rng.choice(["F", "Femme", "Patiente", "Mme"] if female else ["H", "Homme", "Patient", "M."])
    age = num(lab["age"], rng, words_p)
    parts.append(rng.choice([f"{sex_word} {age} ans", f"{sex_word}, {age} ans", f"{sex_word} de {age} ans",
                             f"{sex_word} âgé{'e' if female else ''} de {age} ans"]))
    parts.append(rng.choice(["TA ", "tension ", "TA à ", "tension artérielle "]) + bp_text(sys_, dia, rng, words_p))
    if rng.random() < 0.15:
        s2, d2 = sys_ - rng.randint(2, 8), dia - rng.randint(0, 4)
        lab["bp2"] = f"{s2}/{d2}"
        parts.append(rng.choice(["contrôle ", "deuxième mesure ", "TA de contrôle "]) + bp_text(s2, d2, rng, words_p))

    # symptoms
    if rng.random() < 0.12:
        for s in SYMPTOMS:
            lab[s] = "absent"
        parts.append(rng.choice(NONE_ALL))
    else:
        mentioned = [s for s in SYMPTOMS if rng.random() < 0.5]
        for s in SYMPTOMS:
            lab[s] = "not_mentioned"
        absents = []
        for s in mentioned:
            st = rng.choices(["present", "absent", "uncertain"], [0.45, 0.4, 0.15])[0]
            lab[s] = st
            t = rng.choice(TERMS[s])
            if st == "absent" and rng.random() < 0.4:
                absents.append(t)
                continue
            tpl = rng.choice({"present": PRESENT, "absent": ABSENT, "uncertain": UNCERTAIN}[st])
            parts.append(tpl.format(t=t, d=rng.choice(DURATION)))
        if absents:
            parts.append("pas de " + " ni de ".join(absents) if len(absents) > 1 else "pas de " + absents[0])

    # treatment + adherence
    r = rng.random()
    if r < 0.55:
        lab["on_meds"] = "yes"
        parts.append(rng.choice(ON_YES).format(m=rng.choice(MEDS), e=E))
        k = rng.choices(["yes", "no", "sometimes", "not_mentioned"], [0.25, 0.3, 0.25, 0.2])[0]
        lab["missed_doses"] = k
        if k != "not_mentioned":
            parts.append(rng.choice(MISS[k]).format(e=E))
    elif r < 0.8:
        lab["on_meds"] = "no"
        lab["missed_doses"] = "na"
        parts.append(rng.choice(ON_NO).format(e=E))
    else:
        lab["on_meds"] = "not_mentioned"
        lab["missed_doses"] = "not_mentioned"

    # pregnancy
    if not female:
        lab["pregnancy"] = "na"
    else:
        k = rng.choices(["pregnant", "not_pregnant", "not_mentioned"], [0.2, 0.35, 0.45])[0]
        lab["pregnancy"] = k
        if k != "not_mentioned":
            parts.append(rng.choice(PREG[k]))

    lab["counselling"] = "yes" if rng.random() < 0.35 else "not_mentioned"
    if lab["counselling"] == "yes":
        parts.append(rng.choice(COUNSEL))

    urgent = sys_ > 180 or dia > 110
    lab["referral"] = "yes" if (urgent and rng.random() < 0.7) or rng.random() < 0.05 else "not_mentioned"
    if lab["referral"] == "yes":
        parts.append(rng.choice(REFER).format(e=E))
        lab["follow_up"] = "not_mentioned"
    else:
        k = rng.choices(list(FOLLOW) + ["not_mentioned"], [0.2, 0.25, 0.25, 0.1, 0.05, 0.15])[0]
        lab["follow_up"] = k
        if k != "not_mentioned":
            parts.append(rng.choice(FOLLOW[k]))

    head, rest = parts[:2], parts[2:]
    rng.shuffle(rest)
    joiner = rng.choice([". ", ", ", ". ", "; "])
    text = joiner.join(head + rest) + "."
    if rng.random() < 0.3:  # dictation style: lower case, no punctuation (like ASR output)
        text = text.replace(".", "").replace(";", "").lower()
    return {"text": text, "labels": lab, "synthetic": True}


def main():
    OUT.mkdir(exist_ok=True)
    for name, n, seed in [("train", 1500, 1), ("dev", 300, 2)]:
        rng = random.Random(seed)
        with open(OUT / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for _ in range(n):
                f.write(json.dumps(make_example(rng, words_p=0.25), ensure_ascii=False) + "\n")
        print(name, n)


if __name__ == "__main__":
    main()
