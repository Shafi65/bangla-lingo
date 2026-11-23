import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { AuthCallback } from "@/components/account/AuthCallback";

export const metadata: Metadata = { title: "Signing in · BanglaLingo", robots: { index: false, follow: false } };

/** Where sign-in links (token_hash) and OAuth providers (code) return to. All work happens in the browser. */
export default function AuthCallbackPage() {
  return (
    <AppShell>
      <AuthCallback />
    </AppShell>
  );
}
