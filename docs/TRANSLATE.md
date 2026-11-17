# Translate tab

`/translate` lets a learner look up a word or sentence in English, in Bengali script, or in Bengali
typed with Roman letters (`ami`, `dhonnobad`, `kemon achen`), so a learner without a Bengali keyboard
can still look things up.

It answers in two layers, shown separately so it's always clear which answer came from the course.

## Layer 1: course results (on the device, offline)

At build time the page collects a small index of everything the course teaches:

- every word in `content/lexicon/*.json` (`bn`, `tr`, `en`, `alt`, `pos`, `notes`, `kolkata`, `lesson`),
- the assumed-known words in `content/assumed/*.json`,
- the example sentences in `content/plans/*.json` (`bn`, `tr`, `en`, `alt`).

Code: `web/src/lib/translate/data.ts` (build-time index), `web/src/lib/translate/search.ts` (search).
The index is sent with the page, and the search runs in the browser as you type, so it needs no
network and works offline once the page has been visited (the service worker precaches `/translate`).

**Matching.** A query is compared with each item's English glosses (main gloss, `alt`, and the gloss
without "(...)" asides or split at "/" and ";"), its romanization `tr` (lowercase, no tone marks,
close spellings folded together: doubled letters, `sh`/`s`, `ph`/`f`, `z`/`j`, `ee`/`i`, `oo`/`u`) and
its Bengali text (Unicode NFC, punctuation such as `।` and `?` ignored). English is matched without
regard to case or punctuation.

**Ranking.**

1. Exact match of the whole phrase.
2. The query appears as whole words inside a gloss, romanization or sentence.
3. A gloss or word starts with the query (so results appear while you are still typing).

Within a tier: taught words, then assumed words, then example sentences, with alphabet-lesson letters
last; the main gloss before alternatives; the closest length; then course order. Up to 8 results are
shown, each with the Bengali, the romanization (following the learner's romanization setting), the
English, part of speech, the Kolkata variant and notes when there are any, a play button (a recorded
clip when one exists, otherwise the device's Bengali voice), and a link to the guide section of the
lesson that teaches it.

A multi-word query with no exact or whole-word match is looked up word by word instead (skipping
words such as "the", "a", "is"), showing the course word for each one and marking words the course
doesn't have yet.

## Layer 2: machine translation (online, optional)

For anything the course doesn't cover, pressing **Enter** or **Translate** sends the text to
`POST /translate/api`, a route handler (`web/src/app/translate/api/route.ts`, logic in
`web/src/lib/translate/machine.ts`) that calls the Azure AI Translator REST API v3:

```
POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=bn
Ocp-Apim-Subscription-Key: <key>
Ocp-Apim-Subscription-Region: <region>
Content-Type: application/json

[{ "Text": "..." }]
```

It only runs when the learner asks (not on every keystroke) to save quota. The result appears in its
own card marked as machine translation, with a copy button and, for Bengali output, a play button
using the device voice. When every word in the result is a course word, the course romanization is
shown under it.

The route:

- accepts `POST` with a JSON body `{ "text", "from", "to" }` only (`from`/`to` are `en` and `bn`);
  text must be 1–500 characters;
- reads `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` from server environment variables; the
  key is never sent to the browser, returned, or logged;
- allows 30 requests a minute per IP address (in memory, per server instance);
- gives up after 8 seconds;
- sends `Cache-Control: no-store` and never caches or logs the text.

| Status | Meaning | What the learner sees |
|---|---|---|
| 200 | `{ ok: true, text, from, to }` | the translation |
| 503 `{ configured: false }` | no key set | "Full translation isn't set up yet. Course words still work." |
| 400 / 415 | bad input | the reason |
| 429 | over the rate limit | "Too many translations in a minute…" |
| 502 / 504 | provider error / timeout | a short message; course words still work |

When the browser is offline the page doesn't call the route and says that machine translation needs
a connection.

## Turning on machine translation

The Free (F0) tier of Azure AI Translator includes 2 million characters of standard translation per
month ("2 million characters of any combination of standard translation and custom translation
training free per month", per the [Azure AI Translator pricing page](https://azure.microsoft.com/pricing/details/translator/),
checked 2026-11-17). Check that page for current limits before relying on it.

1. Sign in to the [Azure portal](https://portal.azure.com) (a free Azure account works).
2. **Create a resource** → search for **Translator** → **Create**.
3. Fill in the form:
   - **Subscription** and **Resource group**: yours (create a resource group if needed);
   - **Region**: one near your users (e.g. *Southeast Asia* or *Central India*); you can also choose
     *Global*;
   - **Name**: anything, e.g. `banglalingo-translator`;
   - **Pricing tier**: **Free F0**.
   Then **Review + create** → **Create**.
4. Open the resource → **Keys and Endpoint**. Copy **Key 1** and the **Location/Region** value
   (e.g. `southeastasia`; for a Global resource use `global` or leave the region empty).
5. **Local development:** copy `web/.env.example` to `web/.env.local` and fill in:

   ```
   AZURE_TRANSLATOR_KEY=<Key 1>
   AZURE_TRANSLATOR_REGION=<region>
   ```

   `web/.env.local` is git-ignored (`web/.gitignore` ignores `.env*`), so the key is never committed.
   Restart `npm run dev` / `npm start` after changing it.
6. **Live site:** add the same two variables in your hosting provider's environment-variable settings
   (as server-side variables; never with a `NEXT_PUBLIC_` prefix) and redeploy or restart. They are read
   at request time.
7. Check: open `/translate`, type a sentence, press **Translate**. Without a key the card says
   "Full translation isn't set up yet"; with a key it shows the translation.

If the key is rotated in Azure, update the variable and restart. To turn machine translation off,
remove `AZURE_TRANSLATOR_KEY`; course lookups keep working.

## Tests

- `web/tests/translate-search.test.ts`: normalisation, direction detection, ranking, romanized input,
  `alt` glosses, NFC/NFD Bengali, the per-word fallback, against both the real course and a small
  fixture.
- `web/tests/translate-route.test.ts`: the route handler (no key → 503, bad input → 400/415, success,
  provider error → 502, timeout → 504, rate limit → 429, the key never appears in responses or logs).
- `web/e2e/translate.spec.ts`: typing "thank you", "ami" and Bengali, and the not-set-up note (the e2e
  server runs without a key, so don't put one in `web/.env.local` when running e2e tests).
