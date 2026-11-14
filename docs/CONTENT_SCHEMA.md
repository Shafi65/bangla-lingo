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
| `fill_blank` | `sentence: BnText`, `blank: string`, then either `options: string[]` + `answer: number` or `accepted: string[]` | Sentence with a gap; choose or type the missing word |
| `listen_meaning` | `audio: BnText`, `options: string[]` (English), `answer: number` | Hear a sentence, pick its meaning |
| `reading` | `title?`, `lines: [{ speaker?, bn, tr, en }]` (2–8), `question: string`, `questionBn?: BnText`, `options: string[]`, `answer: number` | Read a dialogue or text, answer a question |

### Sentence-level types (intermediate track)

**`fill_blank`** — `sentence` is the complete, correct sentence. `blank` is the exact Bengali word or phrase of `sentence.bn` that is removed; it must occur **exactly once** as whole words (`ভালো` does not match inside `ভালোবাসি`; `।` `,` `?` end a word). Give **either** `options` + `answer` (Bengali script; `options[answer]` must equal `blank`) **or** `accepted` (typed answer: Bengali spellings plus transliteration variants; `blank` itself is always accepted). The learner sees the sentence with a gap and `sentence.en` underneath as the cue. The transliteration under the gap has the blank's romanisation masked (`___`) until the answer is checked; if the Bengali and `tr` words don't line up one to one, it is hidden until then. The Bengali words of `sentence` must already be taught (strict rule); the exercise tests the `blank` word for spaced review.
```json
{ "id": "e07", "type": "fill_blank",
  "sentence": { "bn": "আমি ভালো আছি।", "tr": "ami bhalo achhi", "en": "I am fine." },
  "blank": "ভালো", "options": ["ভালো", "খারাপ", "বড়", "ছোট"], "answer": 0,
  "why": "Optional rule." }
```
Typed form: replace `options`/`answer` with `"accepted": ["ভালো", "bhalo", "bhaalo"]`.

**`listen_meaning`** — `audio` is spoken (TTS of `audio.bn`); `options` are English meanings (no Bengali script). The Bengali text and transliteration stay hidden until the answer is checked, then appear in the feedback with audio. Counts as recognition; the words of `audio.bn` are tested for spaced review.
```json
{ "id": "e08", "type": "listen_meaning",
  "audio": { "bn": "আমি ভালো আছি।", "tr": "ami bhalo achhi", "en": "I am fine." },
  "options": ["I am fine.", "Thank you.", "Are you well?"], "answer": 0 }
```

**`reading`** — 2–8 `lines`, each a full BnText plus an optional `speaker` (give every line one, or none): with speakers they show as chat bubbles, without as a paragraph. Each line has its own audio button, there is a "Play all" button, and each line's English is hidden behind "Show translation". `question` is in English; add `questionBn` to also show the question in Bengali (then `question` is its English gloss). `options` are all English or all Bengali script (for a Bengali question). Counts as recognition; the words in `lines` are tested for spaced review (not the question).
```json
{ "id": "e09", "type": "reading", "title": "A quick hello",
  "lines": [
    { "speaker": "Rina", "bn": "তুমি ভালো আছ?", "tr": "tumi bhalo achho?", "en": "Are you well?" },
    { "speaker": "Karim", "bn": "হ্যাঁ, আমি ভালো আছি।", "tr": "hya, ami bhalo achhi", "en": "Yes, I am fine." }
  ],
  "question": "How is Karim?",
  "options": ["Fine", "Tired", "Hungry"], "answer": 0 }
```

All three accept `why` and `recycle` like other exercises. The validator checks them in the strict rules too: every Bengali word shown (sentence, lines, `questionBn`, Bengali options) must be taught before. Audio clips are generated for `sentence`, `audio` and every reading line (`npm run gen:audio`).

Rules:
- In `bn_to_en`, options/answers are English; in `en_to_bn`, options/tiles are Bengali script.
- Answer checking ignores case, punctuation, and extra spaces.
- The app shuffles `options` each time an exercise is shown, so never rely on option position in other fields; `answer` is always the index into the authored `options`.
- The app looks up transliteration for Bengali options and tiles from `content/lexicon/`, lesson `vocab` and plan sentences (by exact text, then word by word), so every Bengali option/tile should be spelled as in the lexicon. No match means no transliteration is shown.
- 8–15 hand-written exercises per lesson, plus up to 5 review exercises marked `"recycle": true` that `npm run recycle` appends (never edit those by hand). Each new vocab item must appear at least twice.
