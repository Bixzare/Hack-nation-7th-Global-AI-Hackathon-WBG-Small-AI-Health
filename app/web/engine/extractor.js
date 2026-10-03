// Note -> fixed record. Language-neutral: the lexicon (M1) and classifier weights (M2) come from JSON.
// M0: stub, returns an empty record with every field marked "please check".

export function emptyRecord(schema) {
  const rec = {};
  for (const name of Object.keys(schema.fields)) {
    rec[name] = { value: null, confidence: 0, source: null, check: true };
  }
  return rec;
}

export function extract(text, schema /*, lexicon, model */) {
  return emptyRecord(schema);
}
