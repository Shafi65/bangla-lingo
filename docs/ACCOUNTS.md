# Accounts and cross-device sync

Signing in is optional. Without an account the app works exactly as before: everything is saved in the
browser (localStorage). With an account, the same data is also copied to a Supabase database in the
background, so a learner can continue on another device.

Accounts are **off** unless both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
at build time. With either one missing there is no account UI, the Supabase library is never downloaded
and no network call is made for accounts. Tests and the default e2e suite run with accounts off.

## Architecture

Local-first: the device stays the source of truth. Every save is instant and works offline; sync runs
after it and never blocks the UI.

```
 lesson / settings / practice UI
            │  (unchanged store APIs)
            ▼
 local stores (localStorage) ──subscribe──► sync engine ──► Supabase (4 rows per user, RLS)
            ▲                                   │
            └──────── merged value ◄────────────┘   pull → merge → write local → push
```

| Path | What it does |
|---|---|
| `web/src/lib/auth/config.ts` | Feature flag and settings (`ACCOUNTS_ENABLED`, providers, storage key). |
| `web/src/lib/auth/client.ts` | Creates the supabase-js browser client on first use only (a separate chunk). Session in localStorage under `banglalingo.auth.v1`; no cookies. |
| `web/src/lib/auth/session.ts` | Auth state (`useAuth`) and actions: email link/code, OAuth, callback, sign out, delete. |
| `web/src/lib/sync/merge.ts` | Pure merge rules (below). |
| `web/src/lib/sync/codec.ts` | Server document formats and tolerant parsers for untrusted rows. |
| `web/src/lib/sync/adapters.ts` | One adapter per document, binding it to the existing stores. |
| `web/src/lib/sync/engine.ts` | Debounce, single-flight cycles, conditional pushes, backoff, online/hidden triggers. |
| `web/src/lib/sync/remote.ts` | The Supabase implementation of the engine's `Remote`. |
| `web/src/lib/sync/runtime.ts` | Starts/stops the engine as the user signs in/out; export, sign-out and delete helpers. |
| `web/src/components/account/*` | Sign-in sheet, Settings → Account, Profile card, the map prompt, callback page UI. Loaded with `next/dynamic` only when accounts are on. |
| `web/src/app/auth/callback` | Where email links and OAuth providers return to. |
| `supabase/migrations/*` | Tables, RLS policies, grants and `delete_my_account()`. |
| `supabase/tests/*` | Applies the migrations to a local Postgres and tests RLS with two users. |

Why plain `@supabase/supabase-js` and not `@supabase/ssr`: nothing on the server reads the session (pages
are static; all account work happens in the browser). `@supabase/ssr` exists to share the session with
the server through cookies, and its own docs recommend `createClient` with your own storage otherwise.

### Sync cycle

For each of the four documents: pull the user's row, merge it with the local value, write the result
locally if it changed (through the store's normal API, so the UI updates), then push it if it differs
from the server copy. Pushes are conditional on the row's `rev` (`update … where rev = n`, insert for a
first row), so two devices syncing at the same moment cannot overwrite each other: the one that loses
re-pulls, merges again and retries.

A cycle runs: when a signed-in session starts (sign-in, or opening the app with a stored session); about
5 s after the last local change (each change restarts the timer); immediately when the page is hidden
(tab switch, app backgrounded, closing); when the browser comes back online; and on **Sync now / Retry**.

On failure nothing local changes. The status turns to **Offline** (no retries until the `online` event) or
**Error**, retried after 2 s, 4 s, 8 s … up to 5 min. Two errors are not retried automatically: a document
over the size cap, and a row written by a newer app version (`schema_version` higher than this build
knows; the app never overwrites it).

### What syncs

| Table | Contents (local key) |
|---|---|
| `user_progress` | XP, streak, last active day, finished lessons with scores, daily XP for 60 days, days covered by a streak freeze (`banglalingo.progress.v1` minus settings) |
| `user_memory` | Per-word review memory (`banglalingo.memory.v1` words, in a compact array form). Answers still waiting to be mapped to words (`pending`) stay on the device. |
| `user_settings` | Settings with a change time per key, and the intro answers (`banglalingo.onboarding.v1`) |
| `user_features` | Formality game (`banglalingo.formality.v1`), handwriting (`banglalingo.write.v1`), speaking self-ratings (`banglalingo.speak.v1`), placement result (`banglalingo.placement.v1`), coins, streak freezes, today's quests and game counters (`banglalingo.game.v1`, minus the one-off "a freeze saved your streak" notice) |

Not synced: the translation cache, the reviewer tool's notes, the offline hint, the theme mirror key
(derived from settings), and speaking recordings (never stored or uploaded at all).

Settings carry no timestamps of their own, so the settings adapter keeps the last settings it saw and a
change time per key in `banglalingo.sync.v1`. On a device with no record yet, keys still at their default
count as "never changed", so an account's earlier choices win over a fresh device's defaults.

## Merge rules

`local` is this device, `remote` the server copy. Every rule is idempotent (merging the same copy twice
changes nothing), and ties go to `local`, so merging an unchanged copy is always a no-op.

| Data | Rule |
|---|---|
| Lessons | Completed on either side stays completed. Best accuracy, times completed and the latest completion time are each the max. A played record beats a placed or tested-out one. Between two skips, a checkpoint test-out beats a placement; otherwise the earlier is kept. |
| XP | Max of the two totals. (Sums would double-count on every sync.) |
| Daily XP | Per day, the max of the two; trimmed to 60 days before the latest day. |
| Last active | The later date. |
| Streak | Recomputed from the union of active days: days in either daily log, plus the run each side's stored streak vouches for (streak S ending on day L means the S active days counted back from L, skipping frozen days, which keeps streaks longer than the 60-day log). Counted back from the merged last-active day; a frozen day bridges a gap without counting. |
| Frozen days | Union of both sides, trimmed like the daily log. |
| Word memory | Per word, the record with the later `lastSeen` (time of the last graded answer). Ties: more `reps`, then more `lapses`, then this device. |
| Settings | Last writer wins per key, by the key's change time. Tie: this device. |
| Intro answers | Finished on either side counts as finished; otherwise this device's. |
| Formality | Unlocked tier, best score per tier and rounds played: each the max. |
| Handwriting | Per letter, the better state (written > traced). |
| Speaking | Per item, the later rating. Tie: more ratings, then this device. |
| Placement | The more recent test (`takenAt`). |
| Game | Coins and freezes are kept as earned / spent / used totals, each the max (so a balance is never double-counted); market days likewise (bought / used). Today's quests: the later day wins; on the same day, per-quest max progress, and opened on either side counts as opened. Lifetime counters: each the max. Streak goal: kept if either side has one, the later-set one when both do. Owned lamps: union; the lit lamp is this device's if it owns it. Review boost: the later end time. |

Signing in on a device with guest progress merges that progress into the account (nothing is lost on
either side). Signing out keeps local data unless "Also remove progress from this device" is ticked; on a
shared device, tick it, or the next person to sign in there would merge your progress into their account.

## Schema and security

`supabase/migrations/20261122000000_accounts_sync.sql` creates four tables with the same shape:

| Column | |
|---|---|
| `user_id uuid primary key default auth.uid()` | references `auth.users(id) on delete cascade` |
| `data jsonb` | must be an object, at most 512 KB as JSON text (check constraint) |
| `schema_version integer` | document format (currently 1) |
| `rev bigint` | revision for conditional updates |
| `updated_at timestamptz` | set by a trigger on every update |

- **Row Level Security** is enabled on every table, with one policy per command (select, insert, update,
  delete), all `to authenticated` and all requiring `(select auth.uid()) = user_id` (insert and update also
  `with check`, so a row can't be created for, or moved to, another user). There is no policy for `anon`.
- **Grants** are explicit, because the project has "Grant API access to new tables automatically" turned
  off: `select, insert, update, delete` to `authenticated` only; `revoke all` from `anon` and `public`.
- **`public.delete_my_account()`** is `security definer` with an empty `search_path`. It refuses to run
  without `auth.uid()`, deletes the caller's four rows and then their `auth.users` row (sessions and
  identities cascade). `execute` is granted to `authenticated` only and revoked from `public` and `anon`.
  The app never needs the service-role key.
- The app only ever holds the anon (publishable) key, which is safe to ship: it can do nothing beyond what
  these policies allow.

### Testing the migrations

`bash supabase/tests/run-local.sh` starts a throwaway local PostgreSQL (15+), adds a small stand-in for
Supabase's `auth` schema and roles (`supabase/tests/supabase_stub.sql`), applies the migrations twice (they
are re-runnable) and runs `supabase/tests/rls_test.sql`. That script acts as two users by setting
`request.jwt.claims` and `role authenticated`, and checks that each user sees and changes only their own
rows, `anon` has no access even with a forged claim, oversized and non-object documents are refused,
`delete_my_account()` removes only the caller, and the privilege catalogue matches the list above.

## Owner setup

### 1. Create the project

1. At supabase.com, create a new project on the **Free** plan. Pick a region near most learners (for
   Bangladesh, Singapore `ap-southeast-1` or Mumbai `ap-south-1`). Save the database password somewhere
   safe; the app never needs it.
2. Project settings used by this setup: **Enable Data API: ON**, **Grant API access to new tables
   automatically: OFF**, **Enable RLS on new tables automatically: ON**. The migration grants and enables
   everything it needs explicitly, so it is correct either way.

### 2. Run the migration

Either:

- **SQL editor:** Dashboard → SQL Editor → New query → paste the whole of
  `supabase/migrations/20261122000000_accounts_sync.sql` → Run. Running it again is harmless.
- **Supabase CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>` (from the repo root),
  then `npx supabase db push`.

Check: Table Editor shows `user_progress`, `user_memory`, `user_settings` and `user_features`, each marked
"RLS enabled", with four policies.

### 3. Auth settings

Dashboard → Authentication → **URL Configuration**:

- **Site URL:** `https://bangla-lingo.vercel.app`
- **Redirect URLs** (add each):
  - `https://bangla-lingo.vercel.app/**`
  - `https://*-<vercel-scope-slug>.vercel.app/**` (preview deployments; the scope slug is the team or
    account name that ends every preview URL, e.g. a preview at `bangla-lingo-git-my-branch-acme-team.vercel.app`
    has scope `acme-team`, giving `https://*-acme-team.vercel.app/**`)
  - `http://localhost:3000/**`

Dashboard → Authentication → **Sign In / Providers** → Email: enabled, "Confirm email" may stay on.

### 4. Email template

Dashboard → Authentication → **Emails** → Templates → **Magic link or OTP**:

Subject: `Your BanglaLingo sign-in link`

```html
<h2>Sign in to BanglaLingo</h2>
<p>Tap the button to sign in on this device:</p>
<p><a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email">Sign in to BanglaLingo</a></p>
<p>Or type this code in the app: <strong>{{ .Token }}</strong></p>
<p>The link and code work once and expire soon. If you didn't ask to sign in, ignore this email.</p>
```

Why this form: the link carries `token_hash` (verified with `verifyOtp`), so it works in any browser,
including one other than the browser that asked for it (the default `{{ .ConfirmationURL }}` with PKCE only
works in the same browser). The token sits in the URL hash, so it works whether or not `RedirectTo`
already has a query string, is never sent to the web server, and is only used when the page's script
runs, which also protects it from link scanners that prefetch emails. If `RedirectTo` isn't in the allowed
list, Supabase substitutes the Site URL; the app forwards such a link to `/auth/callback` itself. The code
lets a learner who opens the email on their phone sign in on their laptop.

Also apply the same template to **Confirm signup** (first sign-in of a new email may use it), replacing
"Sign in" with "Confirm your email and sign in" if you like.

The built-in email sender is rate-limited and meant for testing (a few emails per hour). Before inviting
many learners, add custom SMTP under Authentication → Emails → SMTP settings (any provider; Resend,
Postmark and Amazon SES have free tiers).

### 5. Vercel

Project → Settings → Environment Variables, for **Production** and **Preview**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Project Settings → API (Data API) → Project URL, `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon / publishable** key from Project Settings → API Keys. Never the service-role or secret key. |

Then redeploy (Deployments → … → Redeploy): the values are read at build time. Check: Settings shows an
**Account** section; signing in sends an email; after signing in, the status reads "Synced at …".

For local development put the same two lines in `web/.env.local` (git-ignored).

### Google sign-in later

The code already supports it; no rework needed:

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).
   Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`. Configure the consent screen
   (app name BanglaLingo, support email, the privacy page `https://bangla-lingo.vercel.app/privacy`).
2. Supabase → Authentication → Sign In / Providers → Google: enable, paste the client ID and secret.
3. Vercel: add `NEXT_PUBLIC_AUTH_PROVIDERS=google` (Production + Preview) and redeploy. The sign-in sheet
   then shows "Continue with Google". Google returns to `/auth/callback?code=…` (PKCE), which the callback
   page already handles. The redirect URLs from step 3 cover it.

A learner who used the email link and later uses Google with the same address gets the same account
(Supabase links identities with the same verified email).

### Free plan: inactivity pause

Free projects are paused after about a week without database activity (a few requests a day is enough to
avoid it). While paused, sign-in and sync fail; the app keeps working on each device and shows
"Couldn't sync", then catches up automatically once the project is back. Nothing local is lost.

To restore: Supabase Dashboard → your organization → the paused project → **Resume project**. Data and
settings come back as they were. A paused project can be restored for a limited time (currently up to a
year according to Supabase's docs), so don't leave it paused indefinitely; Project Settings → General
shows the deadline. Upgrading to a paid plan removes pausing.

### Deleting data on request

Learners delete their own account in Settings → Account → "Delete my account and data". If someone asks
you instead: Dashboard → Authentication → Users → find the email → Delete user. Their rows go with it
(`on delete cascade`).
