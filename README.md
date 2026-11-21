# BanglaLingo 🇧🇩

A free, gamified course for English speakers learning Bengali (বাংলা): bite-sized lessons, spoken audio, and a dedicated track for reading the Bengali script.

**Features**
- Course map with interleaved vocabulary and alphabet units
- Lessons with nine exercise types, plus hearts, XP, streaks and a daily goal
- Smart review that brings back words you are about to forget
- Guide, dictionary and a translate page (English, Bengali script or Roman letters)
- Placement test to find your starting point
- Speaking practice and a formality trainer (তুই / তুমি / আপনি)
- Handwriting tracing for the Bengali letters
- Offline mode and installable on phones
- Profile and achievements
- Reviewer mode for Bengali speakers to check lessons, and a privacy page

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

See [docs/LESSON_PIPELINE.md](docs/LESSON_PIPELINE.md), [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md) and [content/TRANSLITERATION.md](content/TRANSLITERATION.md). Audio clips: [docs/AUDIO.md](docs/AUDIO.md).

Lessons marked `"status": "draft"` haven't had a native-speaker review yet. Corrections from Bengali speakers are very welcome.

## Contributing
Family and friends are welcome to help, no coding needed: review Bengali in the app at `/reviewer`, or ask Claude to make a change on a branch and open a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).
