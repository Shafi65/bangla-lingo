// The Supabase browser client, created on first use only. Guests who never open sign-in never load
// supabase-js (it is a separate chunk) and never make a network call.
//
// The session lives in localStorage under AUTH_STORAGE_KEY (no cookies): nothing on the server
// needs it, because pages are static and all account work happens in the browser.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNTS_ENABLED, AUTH_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!ACCOUNTS_ENABLED) return Promise.reject(new Error("Accounts are not configured"));
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // The sync engine has its own backoff (lib/sync/engine.ts); no hidden retries underneath it.
      db: { retry: false },
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        // The callback page (app/auth/callback) handles sign-in links and OAuth returns itself.
        detectSessionInUrl: false,
        // PKCE for OAuth providers; email links use token_hash, which works in any browser.
        flowType: "pkce",
      },
    }),
  );
  return clientPromise;
}

/** True once a client exists (so sign-out etc. never create one just to do nothing). */
export function hasSupabase(): boolean {
  return clientPromise !== null;
}

/** True if this browser has a stored session (or a pending OAuth verifier). */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(window.localStorage).some((k) => k === AUTH_STORAGE_KEY || k.startsWith(`${AUTH_STORAGE_KEY}-`));
  } catch {
    return false;
  }
}

/** Test hook. */
export function __resetSupabaseForTests() {
  clientPromise = null;
}
