# Deploying to Vercel

The web app lives in `web/` and reads the course data in `content/` (outside the app folder), so a few
settings matter.

## Vercel project settings

| Setting | Value |
|---|---|
| Framework preset | Next.js (default) |
| Root Directory | `web` |
| Include files outside the root directory in the Build Step | **Enabled** (needed so `../content` is available) |
| Package manager | npm (default, uses `web/package-lock.json`) |
| Build / install commands | defaults |

`web/next.config.ts` sets `outputFileTracingRoot` and `turbopack.root` to the repo root and lists the
`content/` JSON in `outputFileTracingIncludes`, so the files the server reads at request time
(for example `/offline/precache.json`) are packed into the serverless output.

## Environment variables (all optional)

| Name | Effect |
|---|---|
| `AZURE_TRANSLATOR_KEY` | Turns on machine translation on the Translate page. Server-only. Without it the page says machine translation isn't set up and the course dictionary still works. |
| `AZURE_TRANSLATOR_REGION` | Region of the Azure Translator resource, e.g. `southeastasia`. Server-only. |
| `NEXT_PUBLIC_ALLOW_INDEXING` | Set to `1` to let search engines index the site. Default: blocked (robots.txt disallows everything and pages are `noindex`). Read at build time: redeploy after changing it. |

`web/.env.example` lists the names with no values. No secrets are committed; set real values only in
Vercel (or a git-ignored `web/.env.local`). See `docs/TRANSLATE.md` for the translator setup.

## Previews

Every push to a branch and every pull request gets its own preview URL. Previews use the same settings
and are also blocked from search engines unless `NEXT_PUBLIC_ALLOW_INDEXING=1` is set for the Preview
environment. Environment variables can be scoped per environment (Production, Preview, Development), so
the translator key can be left out of previews.

## Notes

- Progress is stored in each visitor's browser; the server keeps no user data. See `/privacy` in the app.
- Responses carry basic security headers (no sniffing, strict referrer policy, microphone allowed for
  this site only, no framing). There is no script CSP.
- The offline service worker names its cache after the deployment id, so each deploy refreshes it.
