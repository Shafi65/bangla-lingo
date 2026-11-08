# BanglaLingo 🇧🇩

A free, gamified course for English speakers learning Bengali (বাংলা): bite-sized lessons, spoken audio, and a dedicated track for reading the Bengali script.

**Features:** course map with interleaved vocabulary and alphabet units · six exercise types (multiple choice, word bank, matching, listening, typing, letter recognition) · hearts, XP, streaks and a daily goal · practice mode · "My words" list · transliteration that can fade out as you learn the script · installable on phones.

Variety taught: Standard Colloquial Bengali, Bangladesh usage, with Kolkata variants noted.

## Run locally
Requires Node.js 20+.
```bash
git clone https://github.com/Shafi65/bangla-lingo.git
cd bangla-lingo/web
npm install
npm run dev        # http://localhost:3000
```

## Project layout
```
web/        Next.js app (TypeScript, Tailwind)
content/    course data: course.json, lexicon/, plans/, units/, script/
content/scripts/   validate · gen:lesson · status tooling
docs/       content format docs
```

## Working on content
| command (repo root) | does |
|---|---|
| `npm run validate` | checks all content (schema, spellings vs. lexicon, no word used before it's taught) |
| `npm run status` | lessons planned / drafted / reviewed per unit |
| `npm run gen:lesson -- <lesson-id>` | drafts a lesson from its plan |

See [docs/LESSON_PIPELINE.md](docs/LESSON_PIPELINE.md), [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md) and [content/TRANSLITERATION.md](content/TRANSLITERATION.md).

Lessons marked `"status": "draft"` haven't had a native-speaker review yet. Corrections from Bengali speakers are very welcome.
