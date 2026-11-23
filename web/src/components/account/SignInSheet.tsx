"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/config";
import { EMAIL_RE, sendEmailLink, signInWithProvider, useAuth, verifyEmailCode } from "@/lib/auth/session";

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Continue with Google" };

/**
 * Optional sign-in, in a native modal <dialog> (a bottom sheet on phones). Step 1: email. Step 2:
 * "check your email", with a field for the 6-digit code from the same email (handy when the email
 * is opened on another device). Mount it to open; `onClose` fires on Esc, backdrop or Close.
 */
export function SignInSheet({ onClose, next }: { onClose: () => void; next?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stepState, setStep] = useState<"email" | "sent" | "done">("email");
  const auth = useAuth();
  // Signed in from the link in another tab: show the done step here too.
  const step = stepState === "sent" && auth.status === "signed-in" ? "done" : stepState;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const close = () => ref.current?.close();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const validEmail = EMAIL_RE.test(email.trim());

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="sign-in-sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) close(); // backdrop
      }}
      className="animate-rise m-auto max-h-[90dvh] w-[min(94vw,28rem)] overflow-y-auto rounded-[var(--radius-panel)] border-2 border-line bg-surface p-6 text-ink backdrop:bg-[var(--color-scrim)] backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-xl font-black">
          {step === "done" ? "You're signed in" : "Save your progress across devices"}
        </h2>
        <button type="button" className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunk" aria-label="Close" onClick={close}>
          <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      {step === "email" && (
        <>
          <p className="mt-1 text-sm font-semibold text-muted">
            Optional. Your progress keeps saving on this device either way. Signing in also keeps a copy in your
            account, so you can pick up on your phone or another computer.
          </p>
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!validEmail || busy) return;
              void run(async () => {
                await sendEmailLink(email, next);
                setStep("sent");
              });
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-base font-semibold outline-none focus:border-brand"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={!validEmail || busy}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
          {OAUTH_PROVIDERS.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t-2 border-line pt-4">
              {OAUTH_PROVIDERS.map((p) => (
                <button key={p} type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => void run(() => signInWithProvider(p, next))}>
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs font-semibold text-muted">
            No password needed. We only use your email to sign you in. See{" "}
            <Link href="/privacy" className="font-bold text-brand-dark underline">
              Privacy
            </Link>
            .
          </p>
        </>
      )}

      {step === "sent" && (
        <>
          <p className="mt-2 font-semibold" role="status">
            We sent a sign-in link to <span className="font-extrabold">{email.trim()}</span>. Open it on this device to
            finish signing in.
          </p>
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              void run(async () => {
                await verifyEmailCode(email, code);
                setStep("done");
              });
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Or enter the 6-digit code from the email</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-center text-xl font-black tracking-[0.3em] outline-none focus:border-brand"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={code.length < 6 || busy}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setStep("email"); setCode(""); setError(null); }}>
              Use a different email
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(() => sendEmailLink(email, next))}>
              Send again
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <p className="mt-2 font-semibold text-muted" role="status">
            Your progress on this device is being combined with your account. Nothing is lost.
          </p>
          <button type="button" autoFocus className="btn btn-primary mt-5 w-full" onClick={close}>
            Done
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-accent-light px-4 py-3 text-sm font-bold text-accent-dark">
          {error}
        </p>
      )}
    </dialog>
  );
}
