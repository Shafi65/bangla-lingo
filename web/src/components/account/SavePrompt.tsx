"use client";

import { useState, useSyncExternalStore } from "react";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { useAuth } from "@/lib/auth/session";
import { earnedRecords, useProgress } from "@/lib/progress";
import { SignInSheet } from "./SignInSheet";

/** Played lessons before the prompt appears. */
export const PROMPT_AFTER_LESSONS = 3;
export const PROMPT_KEY = "banglalingo.account.prompt.v1";

const listeners = new Set<() => void>();
function dismissed(): boolean {
  try {
    return window.localStorage.getItem(PROMPT_KEY) !== null;
  } catch {
    return true; // storage blocked: never show
  }
}
function dismiss() {
  try {
    window.localStorage.setItem(PROMPT_KEY, JSON.stringify({ dismissed: true }));
  } catch {
    // nothing to remember it in
  }
  listeners.forEach((l) => l());
}

/**
 * One quiet card on the map after a few played lessons, for guests only: "Save your progress across
 * devices". Dismissed once, it never comes back (sign-in stays available in Settings and Profile).
 */
export function SavePrompt() {
  const auth = useAuth();
  const progress = useProgress();
  const hidden = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dismissed,
    () => true,
  );
  const [open, setOpen] = useState(false);
  if (!ACCOUNTS_ENABLED) return null;
  const played = Object.keys(earnedRecords(progress.completed)).length;
  if (open) return <SignInSheet onClose={() => { setOpen(false); dismiss(); }} next="/" />;
  if (hidden || auth.status !== "signed-out" || played < PROMPT_AFTER_LESSONS) return null;
  return (
    <section aria-label="Save your progress" className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3" data-testid="save-prompt">
      <p className="min-w-0 flex-1 text-sm font-bold">
        Save your progress across devices
        <span className="block text-xs font-semibold text-muted">Optional. Sign in with your email, no password.</span>
      </p>
      <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => setOpen(true)}>
        Sign in
      </button>
      <button type="button" aria-label="Not now" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunk" onClick={dismiss}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </section>
  );
}
