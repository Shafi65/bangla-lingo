// Account / sync feature flag. Both values are public by design: the anon (publishable) key only
// grants what the Row Level Security policies in supabase/migrations allow. Inlined at build time,
// so changing them needs a redeploy. With either one unset, accounts are off: no account UI, the
// Supabase client is never loaded and no network call is made.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const ACCOUNTS_ENABLED = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";

/** Extra sign-in providers, besides the email link, that the Supabase project has turned on. */
export type OAuthProvider = "google";
const KNOWN_PROVIDERS: readonly OAuthProvider[] = ["google"];

/** Parse NEXT_PUBLIC_AUTH_PROVIDERS ("google", comma-separated) into known providers. */
export function parseProviders(raw: string | undefined): OAuthProvider[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is OAuthProvider => (KNOWN_PROVIDERS as readonly string[]).includes(s))
    .filter((s, i, a) => a.indexOf(s) === i);
}

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = parseProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);

/** localStorage key supabase-js keeps the session under (also holds the PKCE verifier during OAuth). */
export const AUTH_STORAGE_KEY = "banglalingo.auth.v1";

/** Where sign-in links and OAuth return to. */
export const CALLBACK_PATH = "/auth/callback";
