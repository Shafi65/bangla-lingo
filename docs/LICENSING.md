# Licensing and credits for third-party material

BanglaLingo's lessons are original. Anything made by someone else (stories, recordings, photos, dictionary data, fonts, models) must carry its licence and credit, and `npm run validate` enforces this. Treat the app as **commercial**, because it is planned to have a paid supporter tier.

## Where things go

| Path | What |
|---|---|
| `content/sources/licences.json` | Licences the validator knows. `allowed: false` blocks one and shows its `reason`. |
| `content/sources/app-credits.json` | Fonts, models and services the app itself uses. |
| `content/library/<kind>/<id>.json` | Imported items. `<kind>` is `stories`, `words`, `audio` or `media`. The file name must be `<id>.json`. |
| `/credits` | Generated from the three files above. Linked from Settings. |

Lesson files in `content/units/` stay original writing. An imported story lives in the library and lessons point to it. That keeps per-item licences separate from the course licence.

## The `source` block

Every library item needs one:

```json
{
  "id": "sw-the-red-kite",
  "source": {
    "title": "The Red Kite",
    "titleBn": "লাল ঘুড়ি",
    "creators": [
      { "name": "A. Writer", "role": "author" },
      { "name": "B. Artist", "role": "illustrator" },
      { "name": "C. Translator", "role": "translator" }
    ],
    "publisher": "Pratham Books",
    "platform": "StoryWeaver",
    "funder": "Some Foundation",
    "url": "https://storyweaver.org.in/...",
    "licence": "CC-BY-4.0",
    "modified": true,
    "changes": "Added word glosses, audio and comprehension questions.",
    "variety": "in"
  }
}
```

- `creators[].role` is one of: `author`, `illustrator`, `translator`, `reader`, `photographer`, `compiler`, `designer`, `editor`.
- `variety` is `bd`, `in` or `both`. Stories without it get a warning.
- For **public domain** items, add `"published": <year>` and `"authorDied": <year>`. Use the last surviving author's death year.

## What the validator enforces

- The licence must be listed in `licences.json` and allowed. Blocked licences: any **NC** (non-commercial), any **ND** (no derivatives), and **GPL**.
- Licences that require attribution (CC BY, CC BY-SA, OFL, MIT, Apache) need `title`, at least one creator and an `https` url.
- `modified` is required (true or false). If it is true for an attribution licence, `changes` is required, because CC BY requires saying what we changed.
- **Public domain** must pass both tests for the current year:
  - **US**: published in year *Y* becomes PD on 1 January of *Y*+96. In 2026 that means 1930 or earlier.
  - **Bangladesh/India**: PD on 1 January of the author's death year + 61. In 2026 that means the author died in 1965 or earlier.

  Both cut-offs move forward every 1 January, and the check uses the current year automatically. For example, Kazi Nazrul Islam died in 1976, so his works fail until 2037.
- Ids must be lowercase slugs with no duplicates, and folders must be known kinds.

Run it on its own with `node content/scripts/sources.mjs`.

## Rules the validator can't check

- **Check each item's own licence.** StoryWeaver, Bloom, Wikimedia Commons and Lingua Libre set a default licence, but individual items can differ.
- **Public domain covers the original text only.** A modern edition's illustrations, notes or translation can still be under copyright.
- **CC BY-SA:** if we edit a BY-SA item (trim a clip, crop a photo), that item stays CC BY-SA. Adding an unmodified BY-SA item to a lesson doesn't change the lesson's licence.
- **Don't imply endorsement.** Credit Pratham Books and StoryWeaver, but don't use their logos or suggest they back the app.
- **YouTube embeds** must never be behind a paywall, and nothing may be placed over the player. Embeds aren't library items.
- **Common Voice:** never try to identify speakers, and never show speaker metadata.

The full list of resources and the decisions behind it are kept in the project planning notes ("open resources", 2026-11-22).
