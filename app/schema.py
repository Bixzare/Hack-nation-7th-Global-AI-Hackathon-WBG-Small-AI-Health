"""Fixed visit-record schema for an adult hypertension follow-up visit.

The record is a closed list of fields with closed value sets: the tool can only fill these,
never free text for the patient (challenge PDF: "fixed list of answers").
Field choice follows the WHO HEARTS technical package (Evidence-based treatment protocols, 2018).
Thresholds and rules live in rules.py, not here.
"""

TRI = ["present", "absent", "not_asked"]
YNU = ["yes", "no", "unknown"]

# name -> (kind, allowed values or None, label shown to the health worker)
FIELDS = {
    "patient_name":   ("text", None, "Patient name"),
    "age":            ("int", None, "Age (years)"),
    "sex":            ("enum", ["female", "male", "unknown"], "Sex"),
    "phone":          ("text", None, "Phone for reminders"),
    # BP readings are typed numeric fields; numbers from speech only pre-fill and are always "please check".
    "bp1_sys":        ("int", None, "BP 1 systolic"),
    "bp1_dia":        ("int", None, "BP 1 diastolic"),
    "bp2_sys":        ("int", None, "BP 2 systolic (repeat)"),
    "bp2_dia":        ("int", None, "BP 2 diastolic (repeat)"),
    "sym_headache":   ("enum", TRI, "Severe headache"),
    "sym_chest_pain": ("enum", TRI, "Chest pain"),
    "sym_breathless": ("enum", TRI, "Shortness of breath"),
    "sym_vision":     ("enum", TRI, "Blurred vision"),
    "sym_weakness":   ("enum", TRI, "Weakness / numbness"),
    "on_medication":  ("enum", YNU, "Taking BP medicine"),
    "missed_doses":   ("enum", YNU, "Missed doses"),
    "pregnant":       ("enum", ["yes", "no", "unknown", "not_applicable"], "Pregnant"),
    "counselling":    ("enum", YNU, "Lifestyle counselling given"),
    "follow_up_date": ("date", None, "Next visit date"),
}


def empty_record():
    """Every field starts empty and unconfirmed."""
    return {name: {"value": None, "confidence": 0.0, "source": None, "check": True} for name in FIELDS}
