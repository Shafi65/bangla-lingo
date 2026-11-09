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
| `AZURE_VOICE=bn-BD-PradeepNeural` | use the male Bangladeshi voice (regenerates all clips) |

The GitHub workflow **Generate audio** (Actions tab → *Run workflow*) does the same job in the cloud if the repository secrets `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set.

The clips are computer-generated; the app says so in Settings → Audio.
