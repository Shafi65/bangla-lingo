# Translate tab

`/translate` lets a learner look up a word or sentence in English, in Bengali script, or in Bengali
typed with Roman letters (`ami`, `dhonnobad`, `tumi kemon acho`), so a learner without a Bengali
keyboard can still look things up and translate.

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

### When nothing matches (still on the device)

Tried in this order, each ranked below real matches:

1. **Bengali endings.** `-কে -রা -দের -র -ের/-এর -তে -য় -ে -টা -টি -গুলো/-গুলি`, up to two deep, are
   stripped and the base word is shown with a note: `ভাতটা → ভাত + -টা 'the'`.
2. **English word forms.** Plurals, `-ing` and `-ed` go back to a base word that is a course gloss:
   `teachers → teacher`. Only exact glosses count, so `dogs` doesn't land on a letter whose description
   mentions "dog".
3. **Typos, "Did you mean…?"**. Damerau-Levenshtein distance (a swapped pair of letters counts as one
   typo) of at most 1 for words of 4-7 letters and at most 2 for 8 or more; nothing for shorter words.
   Compared with English glosses and romanizations (already folded, so `bhaat` and `bhat` are one
   spelling, not a typo). Code: `fuzzy.ts`, `inflect.ts`, `search.ts`.
4. **Empty state.** With nothing at all, the page shows the closest suggestions and one line saying
   why a machine translation isn't coming: you're offline, or machine translation isn't set up on the
   site (found with the keyless health check below), or "press Translate".

### Romanized Bengali (detection)

Text in Latin letters is read as romanized Bengali only when it clearly looks like it
(`web/src/lib/translate/romanized.ts`). Each word falls in one bucket:

| Bucket | Meaning |
|---|---|
| english | a common English word (`english-words.ts`) or a word from the course's English glosses |
| course | spelled like a course romanization (folded like search: `bhaat`/`bhat`) |
| shaped | not in the course but with a Bengali verb or case ending (`-chhi`, `-chho`, `-lam`, `-ben`, `-der`...) |
| other | anything else |

The text counts as romanized Bengali when at most a quarter of its words are English, at least 60% are
course or shaped words, and at least one is a course word (or two or more are shaped and nothing else
is English or unknown). Choices, all in favour of **not** misfiring:

- English wins a tie: `bad` and `pain` are also course romanizations, but they are English words, so
  `bad` and `pain` stay English.
- `ami` on its own is read as Bengali: it is a course word and not an English word. A lone unknown word
  is never guessed (`bhalobasha` stays English). `ami want water` stays English.
- Wrongly guessing English costs the learner one tap; wrongly guessing Bengali would show nonsense, so
  the bar for Bengali is higher.
- The direction chip (below) and **It's English** override the guess either way.



## Layer 2: machine translation (online, optional)

For anything the course doesn't cover, pressing **Enter** or **Translate** makes one request to
`POST /translate/api`, a route handler (`web/src/app/translate/api/route.ts`, logic in
`web/src/lib/translate/machine.ts`) that calls the Azure AI Translator REST API v3. It only runs when
the learner asks (not on every keystroke) to save quota.

**Direction.** Chosen from what's typed and shown as a chip, "English → Bengali", that swaps when
tapped. Bengali script means Bengali → English; Latin letters that look like Bengali mean "Romanized
Bengali → English" (with an **It's English** button to undo); any other Latin text means English →
Bengali. Tapping the chip with Latin text and Bengali as the source treats it as romanized Bengali.

**What the server does** (one request from the browser, one or two Azure calls):

| Input | Azure calls |
|---|---|
| English → Bengali | `/translate` (en → bn), then `/transliterate` (`language=bn`, `fromScript=Beng`, `toScript=Latn`) on each word of the result, for the romanization |
| Bengali script → English | `/translate` (bn → en) |
| Romanized Bengali → English | `/transliterate` (`fromScript=Latn`, `toScript=Beng`), then `/translate` (bn → en) on the Bengali it produced |

```
POST https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0&language=bn&fromScript=Latn&toScript=Beng
Ocp-Apim-Subscription-Key: <key>
Ocp-Apim-Subscription-Region: <region>
Content-Type: application/json

[{ "Text": "ami bhat khai" }]
```

**On the page.** The result card is marked as machine translation, with a copy button, a play button
for Bengali output (the device voice) and, for romanized input, **Read as: আমি ভাত খাই** so the learner
sees how their letters were understood. Under any machine Bengali there is a romanization, word by
word: the course romanization where the course has the word, the translator's transliteration for the
rest. When any word came from the translator it is labelled **approximate romanization**. It follows
the learner's romanization setting (shown, faded, or behind a tap) like course results.

**The route:**

- accepts `POST` with a JSON body `{ "text", "from", "to", "romanized"? }` only (`from`/`to` are `en`
  and `bn`; `romanized: true` only with `from: "bn", to: "en"` and Latin text); text must be 1-500
  characters;
- `GET /translate/api?health=1` answers `{ "configured": true|false }` and nothing else (see below);
  any other `GET` is 405;
- reads `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` from server environment variables; the
  key is never sent to the browser, returned, or logged;
- allows 60 Azure calls a minute per IP address (in memory, per server instance). An English → Bengali
  or romanized request makes two calls, so it uses two of the 60; a request answered from memory
  uses none;
- keeps the last 100 distinct requests in memory for an hour, so an identical request costs nothing;
- gives up after 8 seconds in total; the romanization step is best effort, and if it fails the
  translation is still returned (without a romanization);
- sends `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and never logs the text or the key
  (only the provider's status number is logged). `/translate/api` is also disallowed in `robots.txt`.

| Status | Meaning | What the learner sees |
|---|---|---|
| 200 | `{ ok: true, text, from, to, read?, roman? }` | the translation |
| 503 `{ configured: false }` | no key set | "Machine translation isn't set up yet. Course words still work." |
| 503 `{ quota: true }` | Azure said 403 with code `403001`, or a 429 whose code or message says the quota/allowance is exceeded (the free monthly quota is used up) | "The free translation allowance is used up for this month; course words still work." The server then stops calling Azure for 15 minutes. |
| 503 `{ error }` | an ordinary Azure 429 burst (codes `429000`-`429002` or unknown) | "Translation is busy, try again in a minute. Course words still work." The server then stops calling Azure for 1 minute. |
| 400 / 413 / 415 | bad input | the reason |
| 429 | over our per-IP limit | "Too many translations in a minute…" |
| 502 / 504 | provider error / timeout | a short message; course words still work |

Azure uses 429 for short bursts of requests, which the per-IP limit keeps us far from; those get the
"busy" message, not the allowance one. Only the real monthly-quota errors get the allowance message.

**Saved on the device.** Successful machine results are kept in `localStorage` under
`banglalingo.translate.cache.v1` (at most 200, least recently used dropped, entries expire after 30
days, every access in `try/catch`). Looking up the same text again makes no request and is marked
"Saved on this device". The text a learner types stays on their device and goes to Azure only when
they press Translate.

When the browser is offline the page doesn't call the route and says that machine translation needs
a connection.

## Turn it on in Vercel

Machine translation needs an Azure AI Translator resource on the **Free (F0)** tier. Use F0, not
Standard (S1):

- **No charges.** F0 includes 2 million characters of translation a month
  ("2 million characters of any combination of standard translation and custom translation training
  free per month", per the [Azure AI Translator pricing page](https://azure.microsoft.com/pricing/details/translator/),
  checked 2026-11-17; check it for current limits).
- **A hard stop at the free monthly limit.** When the limit is reached Azure refuses further requests
  until the next month instead of billing; the site then shows "The free translation allowance is
  used up for this month; course words still work." A pay-as-you-go tier has no such stop, and a public
  site can run up a bill.

Steps:

1. In the [Azure portal](https://portal.azure.com) create a **Translator** resource with **Pricing
   tier: Free F0** (see "Create the resource" below). Copy **Key 1** and the **Location/Region**
   from **Keys and Endpoint**.
2. In Vercel open the project → **Settings** → **Environment Variables**.
3. Add `AZURE_TRANSLATOR_KEY` (the key) and `AZURE_TRANSLATOR_REGION` (for example `southeastasia`;
   for a Global resource use `global`). Tick **Production** and **Preview**. Never prefix them with
   `NEXT_PUBLIC_`; leave **Sensitive** on for the key.
4. **Redeploy** (Deployments → ⋯ → Redeploy). Variables apply to new deployments only.
5. Open `https://<your-site>/translate/api?health=1`. It must show `{"configured":true}`. It only
   says whether a key is set; it never shows the key and never calls Azure, so a wrong key or region
   still shows `true` until you press Translate on the page.
6. On `/translate` type `ami bhat khai` and press **Translate**; you should see "Read as: আমি ভাত
   খাই" and the English.

If `health` shows `{"configured":false}` after a redeploy, the variable is missing for that
environment (Production vs Preview) or the deployment predates it.

### Create the resource

1. Sign in to the Azure portal (a free Azure account works).
2. **Create a resource** → search for **Translator** → **Create**.
3. **Subscription** and **Resource group**: yours (create a group if needed). **Region**: one near
   your users (e.g. *Southeast Asia* or *Central India*), or *Global*. **Name**: anything, e.g.
   `banglalingo-translator`. **Pricing tier**: **Free F0**. Then **Review + create** → **Create**.
4. Open the resource → **Keys and Endpoint** and copy **Key 1** and the region.

### Local development

Copy `web/.env.example` to `web/.env.local` and fill in:

```
AZURE_TRANSLATOR_KEY=<Key 1>
AZURE_TRANSLATOR_REGION=<region>
```

`web/.env.local` is git-ignored (`web/.gitignore` ignores `.env*`), so the key is never committed.
Restart `npm run dev` / `npm start` after changing it. The variables are read at request time.

If the key is rotated in Azure, update the variable in Vercel and redeploy. To turn machine
translation off, remove `AZURE_TRANSLATOR_KEY`; course lookups keep working.

## Tests

- `web/tests/translate-search.test.ts`: normalisation, direction detection, ranking, romanized input,
  `alt` glosses, NFC/NFD Bengali, the per-word fallback, against both the real course and a small
  fixture.
- `web/tests/translate-rescue.test.ts`: typo distance and the 1 / 2 limits, "Did you mean", Bengali
  ending stripping, English plural and `-ing`/`-ed` forms.
- `web/tests/translate-romanized.test.ts`: romanized-Bengali detection (true positives, English false
  positives such as `bad` and `pain`, `ami`), and the romanization of machine Bengali.
- `web/tests/translate-cache.test.ts`: the `localStorage` cache (LRU, expiry, blocked storage) and that
  a repeat lookup makes no request.
- `web/tests/translate-route.test.ts`: the route handler with a mocked `fetch`: no key → 503, bad input,
  the transliterate + translate flow, Beng → Latn romanization, 403001 (and quota-worded 429) → the allowance message, plain 429 → "busy",
  rate limiting by Azure call, the in-memory cache, the health endpoint, and that the key and the
  text never appear in responses or logs.
- `web/e2e/translate.spec.ts`: the course layer, typo suggestions, endings and plurals, the no-key empty
  state, the romanized flow and the allowance message (these answer `/translate/api` with
  `page.route`), the health endpoint, and 360px dark mode. The e2e server runs without a key, so don't
  put one in `web/.env.local` when running e2e tests.
