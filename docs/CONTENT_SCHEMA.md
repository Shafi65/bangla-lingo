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

### Levels, sections, assumed words, script-only display
All optional; a unit without them is a **beginner** unit in **section 1** with no assumed list and normal transliteration.
```json
{
  "id": "bn-for-en",
  "title": "Bengali for English speakers",
  "sections": [{ "id": 1, "title": "Foundations" }, { "id": 2, "title": "Going further" }],
  "units": [
    {
      "id": "i01-catching-up",
      "title": "Catching up",
      "track": "main",
      "level": "intermediate",
      "section": 2,
      "assumes": ["bridge"],
      "scriptOnly": true,
      "lessons": ["i01-l01"]
    }
  ]
}
```
| field | on | meaning |
|---|---|---|
| `level` | unit | `"beginner"` (default) or `"intermediate"`. Intermediate units get the intermediate rules (see LESSON_PIPELINE.md), the intermediate generator recipe and the intermediate audit targets; the course map marks them with an "Intermediate" badge and numbers main units per level. |
| `sections` | course | `[{ "id": <positive integer>, "title": "…" }]`. When present, the course map groups units under these titles (a header per section) instead of its built-in grouping. Section ids must be unique. |
| `section` | unit | A section `id` (default 1). It must be listed in `sections` when `sections` exists. Units stay in `course.json` order within their section. |
| `assumes` | unit | Names of `content/assumed/<name>.json` lists (below). Their words count as already taught for this unit. Not for script units. |
| `scriptOnly` | unit | Default for the unit's lessons (see below); a lesson's own `scriptOnly` wins. |

### Assumed-known lists — `content/assumed/<name>.json`
Words an intermediate unit may use without teaching them (e.g. everything from Section 1, or a published "bridge" list), so units can be written independently of the units before them.
```json
{
  "name": "bridge",
  "entries": [
    { "id": "bari", "bn": "বাড়ি", "tr": "bari", "en": "home", "pos": "noun", "alt": ["house"], "notes": "optional" }
  ]
}
```
`name` must equal the file name. Entries have the lexicon's `id` (lowercase slug), `bn`, `tr`, `en`, `pos` and optional `alt`, `notes`; no `lesson`. **Ids must not collide with `content/lexicon/` ids**, and may not repeat. For a unit that lists the name in `assumes`:
- the taught-before-used checks (plan sentences, dialogues, `validate`, `validate:strict`, `audit`) treat the entries as already taught; a plan's `review` list may name them (warm-up recall);
- the generator and `npm run recycle` use them as distractors (never as recycle targets);
- the app looks up their transliteration, and `npm run gen:audio` records their Bengali.

They are **not course vocabulary**: they don't appear in recycling, review-coverage or "thinly tested" metrics, and nothing is ever tested on them for the learner's spaced review.

### Script-only lessons
A lesson file may carry `"scriptOnly": true` (unit default: `"scriptOnly": true` on the unit in `course.json`; the lesson value wins, so `false` opts one lesson out). In those lessons the app hides transliteration by default: it is shown only when the learner taps "Show pronunciation", whatever their Always / Fade out / Hidden setting says. (Inside answer buttons and word tiles it is hidden entirely; the feedback after checking still shows it.) The Settings toggle "Always show romanization, even in intermediate lessons" (stored as `settings.alwaysRomanize`, default off) turns that off and applies the normal setting there. Practice sessions are unaffected.

## Lesson file
```json
{
  "id": "u01-l01",
  "unit": "u01-basics",
  "title": "Hello!",
  "status": "draft",
  "reviewedBy": "optional — who did the native-speaker review",
  "tip": "Optional short markdown grammar/culture tip shown before the lesson.",
  "scriptOnly": false,
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
- 8–15 hand-written exercises per lesson (12–18 in intermediate units), plus up to 6 review exercises marked `"recycle": true` that `npm run recycle` appends (never edit those by hand). Each new vocab item must appear at least twice.

## Formality trainer — `content/formality/scenarios.json`
Scenario drills for তুই / তুমি / আপনি, played at `/formality`. `npm run validate:formality` enforces this section.
```json
{
  "version": 1,
  "roundSize": 10,
  "unlockScore": 8,
  "intro": [
    {
      "label": "Respectful",
      "use": "Elders, strangers, teachers, and anyone at work.",
      "pronoun": { "bn": "আপনি", "tr": "apni", "en": "you (polite)" },
      "forms": [{ "bn": "আপনি আছেন", "tr": "apni achhen", "en": "you are" }, { "bn": "দেন / দিন", "tr": "den / din", "en": "give!" }]
    }
  ],
  "tiers": [{ "id": 1, "title": "Who is this?", "description": "Pick তুই, তুমি or আপনি for the person in front of you." }],
  "scenarios": [
    {
      "id": "t2-cmd-bosun",
      "tier": 2,
      "situation": "An elderly uncle comes to visit. You invite him to sit. Pick the command.",
      "prompt": { "bn": "আংকেল, ___।", "tr": "angkel, ___", "en": "Uncle, please sit." },
      "options": [
        { "bn": "বসো", "tr": "bosho", "en": "sit (familiar)" },
        { "bn": "বসুন", "tr": "boshun", "en": "please sit (standard)" },
        { "bn": "বসেন", "tr": "boshen", "en": "sit (polite)" }
      ],
      "answer": [1, 2],
      "why": "আপনি has two commands: everyday বসেন and standard বসুন. বসো is for তুমি.",
      "varies": "Both are heard: বসেন is everyday Bangladeshi speech; বসুন is the standard form.",
      "notes": "In Kolkata বসুন is the usual polite command."
    }
  ]
}
```
| field | req | meaning |
|---|---|---|
| `roundSize` | ✓ | questions per round; every tier needs at least this many scenarios |
| `unlockScore` | ✓ | a round score that unlocks the next tier (when the round included the newest unlocked tier) |
| `intro` | ✓ | the intro card: one column per pronoun with a `label`, who it is for (`use`), the `pronoun` and its matching `forms` (BnText; `/` may separate two forms) |
| `tiers` | ✓ | numbered `1, 2, 3 …` in order; 1 = which pronoun, 2 = matching verb form, 3 = whole sentence, 4 = tricky cases |
| `id` | ✓ | unique lowercase slug |
| `situation` | ✓ | English: who you are talking to and what you want to say |
| `prompt` | | optional BnText frame; `___` (in both `bn` and `tr`) marks the gap the options fill |
| `options` | ✓ | 2–4 BnText, different Bengali; the app shuffles them |
| `answer` | ✓ | indexes into `options` of every acceptable answer (at least one option must be wrong) |
| `why` | ✓ | one or two sentences shown after every answer |
| `varies` | with 2+ answers | required when more than one answer is accepted, and only then; starts `"Both are heard: "` |
| `notes` | | Kolkata or regional difference, shown with the feedback |

Rules: every Bengali word in `prompt`, `options` and the intro's `pronoun`/`forms` must be a form in `content/lexicon/` (multi-word lexicon phrases count), and each `tr` must match the lexicon transliteration of its words; Bengali quoted inside `situation`, `why`, `varies`, `notes`, the intro's `use` and tier descriptions must also be lexicon forms, except endings written with a leading hyphen (`-েন`). Text is NFC without ZWJ/ZWNJ; `en` has no Bengali script. A missing word is a reason to write a different scenario, not to add a spelling here. Options whose Bengali has a recorded clip (`content/audio/manifest.json`) get a play button in the feedback.
