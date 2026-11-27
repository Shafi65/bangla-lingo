# Audio

Every Bengali word and sentence in the course can be played as a recorded clip. Clips are generated with Microsoft Azure's neural text-to-speech using a **Bangladeshi Bengali voice** (`bn-BD-NabanitaNeural` by default) and committed to the repo:

```
web/public/audio/<sha1-of-text>.mp3   one clip per unique Bengali string
content/audio/manifest.json          text → clip file, plus the voice used
```

The app plays a clip whenever the manifest has one, and otherwise falls back to a Bengali voice installed on the device (Settings → Audio shows which).

## Generate the clips (on your own computer)

You need a free Azure Speech resource. The whole course is roughly 25,000 characters; the free tier allows 500,000 per month.

1. **Create the resource** — in the [Azure portal](https://portal.azure.com): *Create a resource* → search **Speech** → *Create*. Pick a region such as **East US** and the **Free F0** pricing tier.
2. **Copy the key** — open the resource → *Keys and Endpoint*. Copy **KEY 1** and the **Location/Region** (e.g. `eastus`).
3. **Save them in a `.env` file** at the repo root (it's git-ignored, so the key is never pushed):
   ```
   AZURE_SPEECH_KEY=paste-key-1-here
   AZURE_SPEECH_REGION=eastus
   ```
4. **Check the key** (makes one test clip, changes nothing in the repo):
   ```bash
   npm run gen:audio -- --test
   ```
5. **Generate everything** (a few minutes; safe to re-run — existing clips are skipped):
   ```bash
   npm run gen:audio
   ```
6. **Commit and push** the clips:
   ```bash
   git add web/public/audio content/audio/manifest.json
   git commit -m "Generate audio"
   git push
   ```
7. Restart `npm run dev` — the manifest is read at startup.

Re-run step 5 whenever lessons change; only new text is synthesized and clips that are no longer used are removed.

## Options

| Command / variable | Effect |
|---|---|
| `npm run gen:audio -- --dry` | count strings and characters only, no API calls |
| `npm run gen:audio -- --test` | synthesize one sample clip to a temp file |
| `npm run gen:audio:audition` | render candidate letter names to `audio-audition/` (see below) |
| `AZURE_VOICE=bn-BD-PradeepNeural` | use the male Bangladeshi voice (regenerates all clips) |

Two marks can't be spoken on their own — ং and ঃ. The script synthesizes a stand-in instead (অং and আঃ, falling back to the marks' names) and stores it under the original mark; see `SPEAK_AS` in `content/scripts/gen-audio.mjs`.

## Letter names

Said on its own, a Bengali letter is called by its **name**, not its bare sound: ক is *ko* (kɔ, with the open vowel of *cauliflower*), ঙ is *ungo*, শ is *talobbo sho*, ি is *i-kar*. A plain clip of "ক" comes out as a bare *k*, so letters get their own clips:

- `content/script/letter-names.json` lists every vowel, consonant, vowel sign (কার) and mark with its name in Bengali script (`name`), romanized per `content/TRANSLITERATION.md` (`tr`), an IPA note (`ipa`), sources and Kolkata notes.
- `gen:audio` makes one clip per entry under the manifest key **`letter:<glyph>`** (e.g. `letter:ক`). One-letter words such as ও (*and*) keep their plain key and clip.
- The app plays `letter:<glyph>` wherever a letter is shown by itself: script-lesson intros and exercises (letter recognition, listening, matching), `/write`, the letter sky and the guide's script units. With no letter clip it falls back to the plain clip, then to the device voice saying the name. The name is shown under the glyph there too ("ক · ko").

How a name is spoken is a **strategy** per letter:

| | Sent to Azure | Example |
|---|---|---|
| a | the glyph alone (old behaviour) | ক |
| b | the vowel spelled out | কঅ; vowels as they are; ি → ই; ং → অং |
| c | with ো / on ক | কো; ি → কি |
| d | the full name (`say`, else `name`) | উঙ, তালব্য শ, ই-কার, অনুস্বার |
| e | SSML IPA phoneme (experimental) | `<phoneme alphabet="ipa" ph="kɔ">ক</phoneme>` |

`"defaults"` in the file sets the strategy per kind (now: vowels and consonants **b**, signs and marks **d**); an entry's own `"strategy"` overrides it (the letters with distinguishing names, such as শ ষ স, ণ ন, জ য, ঙ ঞ, use **d**). If a strategy fails, the script falls back to d, b, then a. A letter clip's file name includes what is spoken, so after changing a strategy the next `gen:audio` run makes the new clip and removes the old one.

Azure documents no phone set for Bengali, so (e) may be rejected or ignored; it is only there to try.

### Audition: pick a strategy by ear

```bash
npm run gen:audio:audition            # ক থ ঙ ঞ শ ং ি অ, every candidate
npm run gen:audio:audition -- ড় ঢ় ৎ   # the same plus more letters
npm run gen:audio:audition -- --dry   # only list the candidate texts (no API calls)
open audio-audition/index.html        # macOS; or open the file in any browser
```

It needs the same `.env` as `gen:audio`, writes only to `audio-audition/` (git-ignored; never commit it) and changes nothing else. Then apply the pick in `content/script/letter-names.json`: change a kind in `"defaults"` (e.g. `"consonant": "c"`), or set `"strategy"` on one entry (or `"say"` for a hand-written text), and run `npm run gen:audio`.

The GitHub workflow **Generate audio** (Actions tab → *Run workflow*) does the same job in the cloud if the repository secrets `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set.

The clips are computer-generated; the app says so in Settings → Audio.
