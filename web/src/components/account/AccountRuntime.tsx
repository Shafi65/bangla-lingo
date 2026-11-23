"use client";

import { useEffect } from "react";
import { ACCOUNTS_ENABLED, CALLBACK_PATH } from "@/lib/auth/config";
import { startAccountRuntime } from "@/lib/sync/runtime";

/**
 * Starts account sync in the background (mounted once in the root layout). Renders nothing.
 * Also forwards a sign-in link that landed on another page (Supabase falls back to the Site URL
 * when a redirect URL isn't allowed) to the callback page.
 */
export function AccountRuntime() {
  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return;
    const { pathname, search, hash } = window.location;
    if (pathname !== CALLBACK_PATH && (new URLSearchParams(search).has("token_hash") || new URLSearchParams(hash.slice(1)).has("token_hash"))) {
      window.location.replace(`${CALLBACK_PATH}${search}${hash}`);
      return;
    }
    startAccountRuntime();
  }, []);
  return null;
}
