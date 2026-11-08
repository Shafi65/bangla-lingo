# Lesson pipeline

How a lesson goes from idea → playable. Three layers of data, each validated by `npm run validate`.

```
docs/CURRICULUM.md          human outline (goals, grammar, vocab targets)
        │
content/lexicon/<unit>.json   ① every word/phrase, defined ONCE (spelling, tr, meaning)
content/plans/<unit>.json     ② per-lesson spec: new words, grammar, tip, sentence bank
        │   npm run gen:lesson -- <lesson-id>
        ▼
content/{units|script}/<unit>/<lesson>.json   ③ playable lesson (draft → reviewed)
```

## ① Lexicon — `content/lexicon/<unit-id>.json`
One file per unit, listing the items **introduced** in that unit. IDs are global across all files.

```json
{
  "unit": "u02-pronouns",
  "entries": [
    {
      "id": "tini",
      "bn": "তিনি",
      "tr": "tini",
      "en": "he/she (polite)",
      "alt": ["he", "she"],
      "pos": "pronoun",
      "lesson": "u02-l01",
      "register": "polite",
      "notes": "Written/formal; উনি is the spoken equivalent.",
      "kolkata": { "bn": "…", "tr": "…" }
    }
  ]
}
```
| field | req | meaning |
|---|---|---|
| `id` | ✓ | lowercase slug from `tr`; add a sense suffix on collision (`ki-what`, `ki-q`, `noy-nine`, `noy-isnt`) |
| `bn`, `tr`, `en` | ✓ | canonical forms; `tr` per `content/TRANSLITERATION.md` |
| `alt` | | other acceptable English glosses (used for answer checking & distractor exclusion) |
| `pos` | ✓ | `noun · pronoun · verb · adj · adv · postposition · particle · number · classifier · phrase · name · letter` |
| `lesson` | ✓ | lesson that introduces it |
| `register` | | `intimate` (tui) · `familiar` (tumi) · `polite` (apni) · `formal-written` |
| `notes`, `kolkata` | | usage notes; Kolkata variant |

Inflected forms that learners meet (খাই, খাও, খান…) are **separate entries** — this is a lexicon of forms, not dictionary headwords.
Proper names used in sentences (রাফি, নাদিয়া) are entries with `pos: "name"`.

## ② Plan — `content/plans/<unit-id>.json`
```json
{
  "unit": "u02-pronouns",
  "lessons": [
    {
      "id": "u02-l01",
      "title": "He & she",
      "goal": "Refer to a third person, neutrally and politely.",
      "grammar": ["সে/ও (ordinary) vs তিনি/উনি (polite)", "zero copula recap"],
      "new": ["se", "o-pron", "tini", "uni", "daktar"],
      "review": ["ami", "tumi", "apni", "shikkhok", "chhatro"],
      "tip": "Markdown shown before the lesson. 2–5 short paragraphs, **bold** allowed.",
      "sentences": [
        { "bn": "সে ডাক্তার।", "tr": "she daktar", "en": "He is a doctor.", "alt": ["She is a doctor."] }
      ]
    }
  ]
}
```
Rules (enforced by the validator):
- Every id in `new`/`review` exists in the lexicon; each lexicon entry's `lesson` lists it in exactly that lesson's `new`.
- **No word before its time:** every Bengali token in a sentence must be a lexicon form introduced in this lesson or earlier (course order). Unknown tokens → add them to the lexicon (or rephrase).
- 6–10 sentences per lesson; every `new` item appears in ≥1 sentence (except letters/standalone phrases).
- Sentences end with `।` or `?`; `alt` lists other natural English translations.

## ③ Lesson — generated, then curated
`npm run gen:lesson -- u02-l01` builds a **draft** lesson from the plan + lexicon (vocab block, tip, ~14 exercises in a standard order) and adds it to `course.json`. It refuses to overwrite an existing lesson unless `--force`.

The draft is mechanically correct but generic. The author (Claude) then curates:
- swap weak distractors for **confusable** ones (আছি/আছো/আছেন, তুমি/তোমার),
- add 1–2 `en_to_bn` exercises that test the lesson's grammar point,
- keep ≤15 exercises; vary correct-answer positions.

Lessons carry `"status": "draft" | "reviewed"`. `reviewed` means a native speaker checked it (`"reviewedBy"` records who). The app ships both; the dashboard (`npm run status`) shows what still needs review.

## Standard lesson recipe (what the generator emits, in order)
| # | Exercise | Source |
|---|---|---|
| 1–2 per new word | `select_translation` bn→en, then `listen_select` | lexicon |
| 1 | `match_pairs` (new + review to 4–5) | lexicon |
| 1 (script units, or if letters present) | `script_recognize` | lexicon `pos: letter` |
| 2–3 | `word_bank` bn→en | sentences |
| 1–2 | `word_bank` en→bn | sentences |
| 1 | `type_translation` bn→en | sentences |
| 1 | `select_translation` en→bn | sentences |

## Commands
| command | does |
|---|---|
| `npm run validate` | schema + lexicon + plan + no-word-before-its-time checks |
| `npm run gen:lesson -- <id> [--force]` | draft lesson from plan |
| `npm run status` | coverage dashboard: planned vs authored vs reviewed, lexicon size per unit |
