"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { useAuth } from "@/lib/auth/session";
import { SignInSheet } from "./SignInSheet";
import { SyncStatusLine } from "./SyncStatusLine";

/** Profile: who is signed in (with sync status), or an optional sign-in. Nothing when accounts are off. */
export function ProfileAccountCard() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (!ACCOUNTS_ENABLED || auth.status === "loading" || auth.status === "disabled") return null;
  return (
    <section aria-label="Account" className="card mt-5 p-4" data-testid="profile-account">
      {auth.status === "signed-in" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{auth.user?.email ?? "Signed in"}</p>
            <SyncStatusLine compact />
          </div>
          <Link href="/settings#account" className="btn btn-ghost btn-sm">
            Account
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-muted">Save your progress across devices. Optional.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            Sign in
          </button>
        </div>
      )}
      {open && <SignInSheet onClose={() => setOpen(false)} next="/profile" />}
    </section>
  );
}
