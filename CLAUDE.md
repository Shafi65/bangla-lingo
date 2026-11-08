# BanglaLingo — contributor rules for Claude

Gamified Bengali course for English speakers. `web/` is the Next.js app; `content/` is course data.

- **Content is data, not code.** Lessons live in `content/` as JSON per `docs/CONTENT_SCHEMA.md`; the app never hard-codes lesson text.
- **Lessons go through the pipeline** in `docs/LESSON_PIPELINE.md`: lexicon → plan → `npm run gen:lesson` → curate. Never use a spelling that isn't in `content/lexicon/`.
- Every Bengali item has `bn`, `tr` (per `content/TRANSLITERATION.md`) and `en`. Variety: Standard Colloquial Bengali, Bangladesh usage; Kolkata variants in `notes`/`kolkata`.
- Before committing: `npm run validate` and `npm --prefix web run build` must pass.
- **Keep the brand original:** never name or imitate another app's brand (names, mascots, signature colours, fonts, sounds, illustrations) in code, UI copy or docs. Mechanics like streaks and XP are fine.
- Planning notes, logs and review notes are kept outside this repo — don't add them here.
