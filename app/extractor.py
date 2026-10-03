"""Narrative -> structured record. M0: stub that returns an empty record (everything 'please check')."""
from schema import empty_record


def extract(text: str) -> dict:
    record = empty_record()
    # M1 replaces this with the lexicon + number rules; M2 adds the classifier.
    return record
