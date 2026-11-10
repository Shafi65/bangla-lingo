# Content schema

All content is JSON under `content/`. `content/scripts/validate.mjs` (`npm run validate`) enforces it; this doc is the human spec. The web app imports these files at build time.

Lessons are generated from `content/lexicon/` + `content/plans/` — see `docs/LESSON_PIPELINE.md`.

## `content/course.json`
```json
{
  "id": "bn-for-en",
  "title": "Bengali for English speakers",
  "units": [
    {
      "id": "u01-basics",
      "title": "Basics",
      "description": "Greetings, I and you",
      "track": "main",
      "lessons": ["u01-l01", "u01-l02"]
    },
    {
      "id": "s01-vowels",
      "title": "Script: Vowels",
      "track": "script",
      "lessons": ["s01-l01"]
    }
  ]
}
```
`track` is `"main"` (vocab/grammar, in `content/units/<unit-id>/`) or `"script"` (alphabet, in `content/script/<unit-id>/`).
Lesson file path: `content/{units|script}/<unit-id>/<lesson-id>.json`.

## Lesson file
```json
{
  "id": "u01-l01",
  "unit": "u01-basics",
  "title": "Hello!",
  "status": "draft",
  "reviewedBy": "optional — who did the native-speaker review",
  "tip": "Optional short markdown grammar/culture tip shown before the lesson.",
  "vocab": [
    { "id": "ami", "bn": "আমি", "tr": "ami", "en": "I", "notes": "optional" }
  ],
  "exercises": [ ...see below... ]
}
```

### BnText (used everywhere)
`{ "bn": "আমি", "tr": "ami", "en": "I" }`. `tr` follows `content/TRANSLITERATION.md`.

### Exercise types
Every exercise has `id` (unique in the lesson) and `type`, and may have an optional `why`: one short sentence shown after a wrong answer explaining the rule, e.g. `"আপনি takes the polite ending -েন."` (shown more quietly after a correct answer too). It supports `**bold**`, `*italic*` and `` `code` ``.

| type | fields | UI |
|---|---|---|
| `select_translation` | `prompt: BnText`, `direction: "bn_to_en" \| "en_to_bn"`, `options: string[]`, `answer: number` (index) | Choose the right translation |
| `word_bank` | `prompt: BnText`, `direction`, `tiles: string[]` (correct + distractors), `answer: string[]` (tiles in order), `alt?: string[][]` (other correct tile sequences) | Tap tiles to build sentence |
| `match_pairs` | `pairs: [{ "bn": "...", "tr": "...", "en": "..." }]` (4–5 pairs) | Match Bengali ↔ English |
| `listen_select` | `audio: BnText` (spoken via TTS of `bn`), `options: string[]` (Bengali script), `answer: number` | Hear it, pick what you heard |
| `type_translation` | `prompt: BnText`, `direction`, `accepted: string[]` (all acceptable answers; for `en_to_bn` include transliteration forms) | Free typing |
| `script_recognize` | `glyph: string`, `options: string[]` (transliterations/sounds), `answer: number` | Which sound is this letter? |

Rules:
- In `bn_to_en`, options/answers are English; in `en_to_bn`, options/tiles are Bengali script.
- Answer checking ignores case, punctuation, and extra spaces.
- The app shuffles `options` each time an exercise is shown, so never rely on option position in other fields; `answer` is always the index into the authored `options`.
- The app looks up transliteration for Bengali options and tiles from `content/lexicon/`, lesson `vocab` and plan sentences (by exact text, then word by word), so every Bengali option/tile should be spelled as in the lexicon. No match means no transliteration is shown.
- 8–15 hand-written exercises per lesson, plus up to 5 review exercises marked `"recycle": true` that `npm run recycle` appends (never edit those by hand). Each new vocab item must appear at least twice.
