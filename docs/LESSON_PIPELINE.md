# Lesson pipeline

How a lesson goes from idea → playable. Three layers of data, each validated by `npm run validate`.

```
curriculum outline (goals, grammar, vocab targets)
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
Optional `"kind"`: `"lesson"` (default) · `"review"` · `"checkpoint"`. A lesson is treated as a **review** when `kind` is `"review"` or its title starts with "Review". Reviews must introduce no new items and, together, test at least 80% of their unit's words (names and letters excluded) as targets (prompt, audio, pair, or the answer of an en→bn item); `npm run validate:strict` enforces this. A `checkpoint` is a mixed cross-unit test with no new items.

Optional `"preview": ["khala", …]` (script track): words from **any** unit used as reading examples ("A is for Apple"). They're exercised in the lesson but don't count as taught.

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
- keep ≤15 hand-written exercises; vary correct-answer positions.
- `type_translation.accepted` may include recognised spelling variants noted in the lexicon (একশো, দুইশো, ফুপু, জ্বি) — accepted answers only, never in prompts or options.

Lessons carry `"status": "draft" | "reviewed"`. `reviewed` means a native speaker checked it (`"reviewedBy"` records who). The app ships both; the dashboard (`npm run status`) shows what still needs review.

## ④ Recycling — `npm run recycle`
Hand-written lessons rarely bring old words back, so every main-track lesson except the course's first ends with **recycle exercises**: review items about *earlier* words, tagged `"recycle": true` and numbered `r01`, `r02`, … at the end of `exercises`.

```json
{ "id": "r01", "type": "listen_select", "audio": { "bn": "…", "tr": "…", "en": "…" }, "options": ["…"], "answer": 2, "recycle": true }
```
- `npm run recycle` removes every `recycle`-tagged exercise and rebuilds them. It never touches untagged exercises and is **idempotent and deterministic** (seeded by lesson id), so re-running without content changes changes nothing.
- Selection walks the course in order, tracking in how many later lessons each earlier word has appeared (hand-written exercises included). It favours core parts of speech (pronoun, verb, particle, postposition, number, adverb) and words with the fewest later appearances, avoids words already in the lesson or recycled in the previous lesson, and prefers expanding gaps (about 1, 3, 7+ lessons after the last sighting).
- Forms rotate: Bengali→English select, listen-and-select, English→Bengali select. Distractors are always words already taught (main track); English distractors never share a gloss with the answer. With `--pairs P`, P extra 4-word `match_pairs` recycle exercises are added per lesson, which is by far the cheapest way to raise coverage.
- Options: `--dry` (report only) · `--lesson <id>` (write one lesson; the whole course is still simulated so counts stay consistent) · `--count N` (default 3) · `--count-late M --late-from <unit-prefix>` (a larger count from a later unit, default `u06`) · `--pairs P`.
- Recycle exercises are exempt from the "each new item appears ≥2×" check, are listed separately by `npm run audit`, and sit on top of the 8–15 hand-written exercises (up to 6 recycle exercises per lesson are accepted).
- **After any content change (new or edited lesson, plan or lexicon), run `npm run recycle` before committing**, then `npm run validate`. Because selection depends on everything earlier in the course, a change in one lesson can alter recycle exercises in later lessons; that is expected.

## Standard lesson recipe (what the generator emits, in order)
| # | Exercise | Source |
|---|---|---|
| 1 per new word | `select_translation` bn→en (names too) | lexicon |
| 1 per new word | `listen_select` (names skipped) | lexicon |
| 1 | `match_pairs` (new + review to 4–5) | lexicon |
| 1 (script units, or if letters present) | `script_recognize` (sorted with the recognition block) | lexicon `pos: letter` |
| 2–3 | `word_bank` bn→en | sentences |
| 1–2 | `word_bank` en→bn | sentences |
| 1 | `type_translation` bn→en | sentences |
| 1 | `select_translation` en→bn | sentences |

The generator sorts the draft recognise → listen → match → word bank (bn→en, then en→bn) → type → en→bn select, and trims sentence exercises (never below 3) so that every new item gets a recognition exercise first. A new word's first exercise must never be production.

## Commands
| command | does |
|---|---|
| `npm run validate` | schema + lexicon + plan + no-word-before-its-time checks (sentences) |
| `npm run validate:strict` | `validate` plus teaching-quality rules as errors: (1) no untaught Bengali in main-track exercises (multi-digit numerals made of taught digits and typed `accepted` variants are exempt), (2) a new word's first exercise is recognition, (3) ≤10 new items per lesson, (4) each unit's review lessons test ≥80% of its words, (5) reviews introduce no new words. Prints a count per rule. |
| `npm run recycle [-- --dry --lesson <id> --count N --pairs P]` | rebuild the `recycle` review exercises (see ④) |
| `npm run audit [-- --words --json]` | teaching metrics: recycling, load, skill balance (recycle counted separately), lesson shape, untaught words, per-unit review coverage, words tested ≤2 times |
| `npm run gen:lesson -- <id> [--force]` | draft lesson from plan |
| `npm run status` | coverage dashboard: planned vs authored vs reviewed, lexicon size per unit |
