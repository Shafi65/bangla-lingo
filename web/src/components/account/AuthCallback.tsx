"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { completeSignInFromUrl } from "@/lib/auth/session";
import { startAccountRuntime } from "@/lib/sync/runtime";

export function AuthCallback() {
  const router = useRouter();
  const [state, setState] = useState<{ kind: "working" } | { kind: "error"; message: string }>({ kind: "working" });
  const ran = useRef(false);

  useEffect(() => {
    if (!ACCOUNTS_ENABLED || ran.current) return;
    ran.current = true; // a sign-in link works once: never run it twice (StrictMode)
    const url = new URL(window.location.href);
    // Drop the one-time token from the address bar and history right away.
    window.history.replaceState(null, "", url.pathname);
    startAccountRuntime();
    completeSignInFromUrl(url).then(
      (next) => router.replace(next),
      (e: unknown) => setState({ kind: "error", message: e instanceof Error ? e.message : "Sign-in failed." }),
    );
  }, [router]);

  if (!ACCOUNTS_ENABLED) {
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-black">Accounts aren&apos;t set up</h1>
        <p className="mt-2 font-semibold text-muted">This copy of the app has no sign-in. Your progress is saved on this device.</p>
        <Link href="/" className="btn btn-primary mt-5 w-full">
          Back to learning
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6" aria-live="polite">
      {state.kind === "working" ? (
        <>
          <h1 className="text-2xl font-black">Signing you in…</h1>
          <p className="mt-2 font-semibold text-muted">One moment.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-black">Couldn&apos;t sign you in</h1>
          <p role="alert" className="mt-2 font-semibold text-accent-dark">
            {state.message}
          </p>
          <p className="mt-2 text-sm font-semibold text-muted">Your progress on this device is safe. You can ask for a new link from Settings.</p>
          <Link href="/settings#account" className="btn btn-primary mt-5 w-full">
            Go to Settings
          </Link>
        </>
      )}
    </div>
  );
}
