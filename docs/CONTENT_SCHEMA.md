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

## Stories — `content/stories/<unit-id>-story.json`
One short graded story per main-track beginner unit (from the second unit on), read at `/stories`. A story unlocks when the learner completes its unit's first lesson; finishing it is stored in the browser only (no XP or streak). `npm run validate:stories` enforces this section.
```json
{
  "id": "u02-pronouns-story",
  "unit": "u02-pronouns",
  "title": { "bn": "নাদিয়া কে?", "tr": "nadiya ke?", "en": "Who is Nadia?" },
  "summary": "Rafi meets Emma and introduces Nadia.",
  "status": "draft",
  "lines": [
    { "speaker": "Rafi", "bn": "আমি ছাত্র। ও নাদিয়া।", "tr": "ami chhatro. o nadiya.", "en": "I'm a student. This is Nadia." },
    { "speaker": "Nadia", "bn": "না! ও আমার বন্ধু নয়।", "tr": "na! o amar bondhu noy.", "en": "No! He isn't my friend.", "senses": { "নয়": "noy-isnt" } }
  ],
  "questions": [
    { "after": 0, "question": "Who is Nadia?", "questionBn": { "bn": "নাদিয়া কে?", "tr": "nadiya ke?", "en": "Who is Nadia?" },
      "options": [{ "bn": "ডাক্তার", "tr": "daktar", "en": "a doctor" }, { "bn": "শিক্ষক", "tr": "shikkhok", "en": "a teacher" }],
      "answer": 0, "why": "Rafi says ও ডাক্তার: 'she is a doctor'." },
    { "after": 1, "question": "What does Nadia say about Rafi?", "options": ["He isn't her friend.", "He is a doctor."], "answer": 0, "why": "নয় means 'is not'." }
  ]
}
```
| field | req | meaning |
|---|---|---|
| `id` | ✓ | `<unit-id>-story`, equal to the file name; one story per unit |
| `unit` | ✓ | a main-track beginner unit in `course.json` |
| `title` | ✓ | BnText |
| `summary` | | one English sentence for the story list |
| `status` | | `"draft"` (default) or `"reviewed"`; `reviewedBy` as for lessons |
| `lines` | ✓ | 6–12 lines `{ speaker?, bn, tr, en, senses? }`, shown one at a time. `speaker` is an English name; a line without one is narration. |
| `senses` | | on a line, `questionBn` or a Bengali option: `{ "<word>": "<lexicon id>" }` picks the meaning of a word that two lexicon entries spell alike (নয় nine / is not, দিন day / give, বার day / times, হবে will be / have to). Required for such a word once both entries are taught. |
| `questions` | ✓ | 3–4 multiple-choice questions about meaning, each shown after line `after` (0-based, in line order). `question` is English; `questionBn` (BnText) also shows it in Bengali. `options` are 2–4 English strings **or** 2–4 BnText (Bengali answers); every story has at least one of each kind. `answer` indexes the authored `options` (the app shuffles them). `why` is shown after answering. |

Rules: every Bengali word in `title`, `lines`, `questionBn` and Bengali options must be a `content/lexicon/` form **taught by the end of the story's unit** (course order, script units included; letters don't count; multi-word lexicon phrases count), and each `tr` must match the lexicon transliteration of its words. Bengali quoted inside `question` and `why` must be taught forms too. No digits in `bn` (write numbers as words), NFC without ZWJ/ZWNJ, no Bengali script in `en`, `speaker`, `summary` or English options. The validator splits each line into lexicon forms by greedy longest match, the same rule the app uses for its tap-a-word glosses, so every word of a valid story has a gloss. `npm run gen:audio` records every line's Bengali (not titles, questions or options).

## My family — `content/family/kin.json`
Kin terms for the learner's own family tree, played at `/family`. `npm run validate:family` enforces this section.
```json
{
  "version": 1,
  "defaultVariety": "bd",
  "varieties": [{ "id": "bd", "label": "Bangladesh", "description": "Words used in many Bangladeshi families, especially Muslim families." }],
  "pronouns": [{ "id": "apni", "bn": "আপনি", "tr": "apni", "en": "you (respectful)", "use": "Elders and anyone you show respect to." }],
  "kinds": [{ "id": "how", "label": "Ask how they are" }],
  "phrases": [
    { "id": "how-apni", "kind": "how", "pronouns": ["apni"], "bn": "{addr}, আপনি কেমন আছেন?", "tr": "{addr}, apni kemon achhen?", "en": "{addr}, how are you?" },
    { "id": "intro-apni", "kind": "intro", "pronouns": ["apni"], "bn": "উনি আমার {ref}।", "tr": "uni amar {ref}", "en": "This is my {label}." }
  ],
  "groups": [
    { "id": "mothers-siblings", "title": "Mum's brothers and sisters", "hint": "Aunts and uncles on Mum's side",
      "asks": [
        { "key": "gender", "q": "Is this Mum's brother or sister?", "options": [{ "v": "m", "label": "Brother" }, { "v": "f", "label": "Sister" }] },
        { "key": "age", "q": "Older or younger than Mum?", "options": [{ "v": "elder", "label": "Older than Mum" }, { "v": "younger", "label": "Younger than Mum" }] }
      ] }
  ],
  "relations": [
    {
      "id": "mother-younger-sister", "group": "mothers-siblings", "gen": 1, "gender": "f",
      "pick": { "gender": "f", "age": "younger" },
      "label": "mother's younger sister", "short": "Mum's younger sister",
      "explain": "Aunts and uncles are named by the parent they come from.",
      "pronoun": { "default": "apni", "also": ["tumi"], "note": "আপনি is the safe choice." },
      "phrases": ["greet", "how", "miss", "festival"],
      "terms": {
        "bd": { "ref": { "bn": "ছোট খালা", "tr": "chhoto khala", "en": "aunt" }, "addr": [{ "bn": "খালামণি", "tr": "khalamoni", "en": "auntie" }], "note": "optional" },
        "wb": { "ref": { "bn": "ছোট মাসি", "tr": "chhoto mashi", "en": "aunt" }, "addr": [], "pronoun": { "default": "tumi", "also": ["apni"] } }
      },
      "actions": [{ "label": "Add her husband", "group": "aunt-uncle-spouses", "preset": { "via": "mother-younger-sister" } }]
    }
  ]
}
```
| field | on | meaning |
|---|---|---|
| `varieties` | file | Family-word sets the learner can switch between (`bd`: common in many Bangladeshi families; `wb`: common in many Hindu families and West Bengal). Described as common usage, never as rules. `defaultVariety` is used until the learner chooses. |
| `pronouns` | file | Exactly `apni`, `tumi`, `tui`, in that order, each a BnText plus `use`. |
| `kinds` | file | Phrase kinds a relation can list (`greet`, `how`, `miss`, `festival`). `intro` is reserved for the "talking about them" sentence. |
| `phrases` | file | Templates. `variety` and `pronouns` restrict where a template applies; for every kind (and `intro`), variety and pronoun **exactly one** template must match. Non-intro templates hold one `{addr}` in `bn`, `tr` and `en`, either opening (`{addr}, …`) or closing (`…, {addr}।`) the phrase: it is filled with the address term, or removed when the person is called by name. `intro` templates hold `{ref}` (bn/tr) and `{label}` (en). Optional `note`. |
| `groups` | file | The guided "Add a relative" flow: questions (`asks`) answered one at a time. Every combination of answers must lead to exactly one relation of the group (its `pick`). |
| `gen` | relation | Tree row: 2 grandparents, 1 parents' generation, 0 the learner's, -1 children's. |
| `label` / `short` | relation | English. `label` is lower-case ("mother's younger sister"; shown as "Your …" and in `{label}`); `short` is for prompts ("Mum's younger sister"). |
| `explain` | relation | The "why" note on the card. |
| `pronoun` | relation | `{ default, also, note? }`: the usual pronoun and others families also use. A variety's `terms.<v>.pronoun` overrides it. |
| `phrases` | relation | 2–4 kinds shown on the card. |
| `terms` | relation | One entry per variety: `ref` (talking about them), `addr` (calling them; first = usual; empty = by name), optional `note`, optional `pronoun`. |
| `actions` | relation | Buttons on the card that open a group with some answers preset (e.g. "Add her child (your cousin)"). Preset keys and values must belong to that group. |

Rules: every Bengali word in terms, pronouns, templates **and every phrase composed from them** (each relation × variety × pronoun × address term) must be a form in `content/lexicon/`, and each `tr` must match the lexicon transliteration word by word; Bengali quoted inside `explain`, `note` and `use` must also be lexicon forms. Kin words that no lesson teaches live in the supplementary lexicon `content/lexicon/family-extra.json` (same format, unit `family-extra`, entries without `lesson`; `npm run validate` checks ids and spellings but not lesson placement, because the unit is not in `course.json`). `npm run gen:audio` records every term, the intro sentence and each phrase for the default and listed address terms and pronouns, plus the bare phrase used when someone is called by name or by the family's own word.

The learner's tree is stored on the device only, in `localStorage` key `banglalingo.family.v1`: `{ v: 1, variety?, people: [{ id, rel, name?, call?, pronoun?, linkedTo? }], quiz: { rounds, best } }`. `call` is `{ type: "term", bn, tr }`, `{ type: "name" }` or `{ type: "custom", text }`.

## Bazaar — `content/bazaar/stalls.json`
A short haggling game at `/bazaar`: ask the price, understand the number, haggle where it is expected. `npm run validate:bazaar` enforces this section. **Every Bengali line must be a sentence already taught in `content/units/`, with the same `tr` and `en`**, so the game never introduces Bengali that has not been through the lesson pipeline.
```json
{
  "version": 1,
  "coinsPerStep": 2,
  "haggleBonus": 3,
  "stalls": [
    {
      "id": "mangoes", "title": "The fruit stall", "item": "mangoes", "start": 100, "unit": "a kilo",
      "intro": "Mangoes are piled high. Start by asking the price.",
      "steps": [
        { "kind": "choose", "prompt": "Ask how much these mangoes are.", "options": [{ "bn": "ভাই, এই আমগুলো কত?", "tr": "bhai, ei amgulo koto?", "en": "Brother, how much are these mangoes?" }, { "bn": "…", "tr": "…", "en": "…" }], "answer": 0, "why": "…" },
        { "kind": "listen", "say": { "bn": "একশ টাকা কেজি।", "tr": "eksho taka keji.", "en": "A hundred taka a kilo." }, "prompt": "What price did the seller say?", "choices": ["৳100 a kilo", "৳50 a kilo", "৳1,000 a kilo"], "answer": 0, "why": "…" },
        { "kind": "choose", "prompt": "Haggle politely.", "options": ["…"], "answer": 0, "why": "…", "reply": { "bn": "ঠিক আছে, আশি টাকা দেন।", "tr": "thik achhe, ashi taka den.", "en": "OK, give me eighty taka." }, "price": 80, "haggle": true }
      ]
    }
  ]
}
```
| field | req | meaning |
|---|---|---|
| `coinsPerStep`, `haggleBonus` | ✓ | taka coins per right step, and extra coins when a haggle comes off |
| `start` | ✓ | the asking price in whole taka; `unit` (may be empty) is shown after it |
| `steps` | ✓ | 2+ steps, at least one `listen` step (understanding the price) |
| `kind` | ✓ | `choose` (pick what to say; English is hidden until answered) or `listen` (the seller's `say` line, pick the number from `choices`) |
| `say` | | a seller line shown before the question (required for `listen`) |
| `reply` | | the seller's answer after a right choice |
| `price` | | the price after a right choice; with `"haggle": true` it must be lower and counts as savings, without it it is a quantity change (e.g. half a kilo) |
| `answer`, `why` | ✓ | the right option, and a short explanation (≤ 320 characters) shown after every answer |
