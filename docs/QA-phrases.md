# Demo QA phrases: record these in your own voice

These are the phrases the QA suite uses (`tests/qa/demo_phrases.json`). Expectations are the clinically
correct record and WHO HEARTS flags, reviewed by hand. All patients are synthetic.

**To test speech with your own voice:**
1. Record each phrase (phone voice recorder is fine, normal distance, a quiet room). Save as
   `data/qa/audio/<id>.m4a` (or .wav / .mp3 / .webm / .ogg). `data/` is gitignored and never published.
2. Start the speech service: `.venv-speech/Scripts/python speech/server.py --model small`
3. Run: `npm run test:qa`

For each recording the test prints the raw transcript and checks:
- **Safety (must pass):**
  - every number from speech is "please check";
  - no present danger symptom is marked absent;
  - urgent phrases raise URGENT (or the urgent field is "please check").
- **Values (reported):** each field against the expected record, noting whether a wrong value was
  flagged or silent.

| ID (file name) | Say this |
|---|---|
| `01-short` | Femme 35 ans |
| `02-noor` | Femme, 38 ans. Tension 162 sur 98. Céphalées depuis trois jours. Elle oublie parfois ses médicaments. Pas enceinte. Revoir dans deux semaines. |
| `03-urgent` | Homme 67 ans, tension 190 sur 115, douleur thoracique depuis ce matin, essoufflé, référé à l'hôpital aujourd'hui. |
| `04-controlled` | Homme 50 ans, tension 128 sur 80, pas de plaintes, traitement bien suivi, conseils sur le sel, revoir dans trois mois. |
| `05-pregnant` | Femme 27 ans, enceinte de cinq mois, tension 146 sur 92, vision floue. |
| `06-uncertain` | Homme 39 ans, tension 152 sur 97, peut-être un peu essoufflé, revoir dans deux semaines. |
| `07-no-bp` | Femme 60 ans, appareil de tension en panne, pas de plaintes, revoir dans un mois. |
| `08-very-high` | Homme 70 ans, tension 205 sur 125, pas de plaintes. |
| `09-words` | femme quarante-cinq ans tension cent cinquante sur quatre-vingt-quinze revoir dans quinze jours |
| `10-cmhg` | Femme 50 ans, TA 16/10, sous amlodipine, aucun oubli, RDV dans 1 mois. |
| `11-english` | Woman 45, BP 150 over 95, headache, no chest pain. |
| `12-second-reading` | Homme 32 ans, tension 150 sur 95, pas de traitement, deuxième mesure 148 sur 94, revoir dans une semaine. |
| `13-asr-typos` | FAM 35 ans, c'est fallé depuis hier, tension 140 sur 90. |
| `14-all-negative` | Femme 44 ans, tension 135 sur 85, pas de céphalées, pas de douleur thoracique, pas de vision floue, pas d'essoufflement, traitement bien suivi, revoir dans trois mois. |
| `15-poor-adherence` | Homme 58 ans, tension 172 sur 104, oublie souvent son traitement, céphalées, revoir dans deux semaines. |
| `16-madame` | Madame, 52 ans, TA à 158/96 mmHg, pas de céphalées, revoir le mois prochain. |
| `17-monsieur` | Monsieur 61 ans, tension 15/9, sous traitement, pas d'oubli, à revoir dans 8 jours. |
| `18-absolute-date` | Homme 45 ans, tension 145 sur 90, RDV le 12/10. |

Tip for the demo: `02-noor` (follow-up + reminder), `03-urgent` (URGENT), `06-uncertain` ("not sure"),
`13-asr-typos` (pre-filled but flagged) and `07-no-bp` (BP-not-measured gate) show the most.
