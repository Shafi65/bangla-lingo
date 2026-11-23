"use client";

import { useId, useState } from "react";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { useAuth } from "@/lib/auth/session";
import { deleteAccountAndData, downloadJson, exportMyData, signOutOfAccount } from "@/lib/sync/runtime";
import { SignInSheet } from "./SignInSheet";
import { SyncStatusLine } from "./SyncStatusLine";

/** The phrase typed to confirm account deletion. */
export const DELETE_PHRASE = "DELETE";

/** Settings → Account. Renders nothing when accounts are not configured. */
export function AccountSection() {
  const auth = useAuth();
  const hId = useId();
  const [signingIn, setSigningIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!ACCOUNTS_ENABLED) return null;

  return (
    <section id="account" aria-labelledby={hId} className="scroll-mt-[calc(var(--header-h)+1rem)] card p-5" data-testid="account-section">
      <h2 id={hId} className="text-xl font-black">
        Account
      </h2>
      {auth.status === "signed-in" && auth.user ? (
        <SignedIn email={auth.user.email} onDone={setNotice} />
      ) : (
        <>
          {notice && (
            <p role="status" className="mt-1 mb-2 font-bold text-brand-dark">
              {notice}
            </p>
          )}
          <p className="mt-0.5 mb-4 text-sm font-semibold text-muted">
            Optional. Sign in to save your progress across devices. Without an account everything stays on this device.
          </p>
          <button type="button" className="btn btn-primary w-full" disabled={auth.status === "loading"} onClick={() => setSigningIn(true)}>
            {auth.status === "loading" ? "Checking…" : "Sign in or create an account"}
          </button>
          <ExportButton />
        </>
      )}
      {signingIn && <SignInSheet onClose={() => setSigningIn(false)} next="/settings#account" />}
    </section>
  );
}

function SignedIn({ email, onDone }: { email: string | null; onDone: (msg: string) => void }) {
  const [panel, setPanel] = useState<null | "signout" | "delete">(null);
  return (
    <>
      <p className="mt-0.5 mb-3 text-sm font-semibold text-muted">
        Signed in as <span className="font-extrabold text-ink">{email ?? "your account"}</span>. Progress saves on this
        device first and syncs in the background.
      </p>
      <SyncStatusLine />
      <div className="mt-4 flex flex-col gap-2 border-t-2 border-line pt-4">
        <ExportButton inline />
        {panel === "signout" ? (
          <SignOutPanel onCancel={() => setPanel(null)} onDone={onDone} />
        ) : panel === "delete" ? (
          <DeletePanel onCancel={() => setPanel(null)} onDone={onDone} />
        ) : (
          <>
            <button type="button" className="btn btn-ghost w-full" onClick={() => setPanel("signout")}>
              Sign out
            </button>
            <button type="button" className="btn btn-ghost w-full text-accent-dark" onClick={() => setPanel("delete")}>
              Delete my account and data
            </button>
          </>
        )}
      </div>
    </>
  );
}

function ExportButton({ inline = false }: { inline?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-ghost w-full ${inline ? "" : "mt-2"}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const now = new Date();
          downloadJson(await exportMyData(now), `banglalingo-data-${now.toISOString().slice(0, 10)}.json`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing…" : "Download my data"}
    </button>
  );
}

function SignOutPanel({ onCancel, onDone }: { onCancel: () => void; onDone: (msg: string) => void }) {
  const [removeLocal, setRemoveLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div role="group" aria-label="Sign out" className="rounded-2xl bg-sunk p-4">
      <p className="font-extrabold">Sign out on this device?</p>
      <p className="mt-1 text-sm font-semibold text-muted">Your account keeps a copy. This device keeps its progress unless you tick the box.</p>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm font-bold">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={removeLocal} onChange={(e) => setRemoveLocal(e.target.checked)} />
        Also remove progress from this device
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOutOfAccount({ removeLocal });
            onDone(removeLocal ? "Signed out. Progress removed from this device." : "Signed out. Your progress is still on this device.");
          }}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

function DeletePanel({ onCancel, onDone }: { onCancel: () => void; onDone: (msg: string) => void }) {
  const [typed, setTyped] = useState("");
  const [removeLocal, setRemoveLocal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qId = useId();
  const ok = typed.trim() === DELETE_PHRASE;
  return (
    <div role="alertdialog" aria-labelledby={qId} className="rounded-2xl border-2 border-accent/30 bg-accent-light p-4" data-testid="delete-account">
      <p id={qId} className="font-extrabold text-accent-dark">
        Delete your account and everything saved in it? This can&apos;t be undone.
      </p>
      <p className="mt-1 text-sm font-semibold text-accent-dark">
        Your sign-in and all synced progress, word memory, settings and practice records are removed from the server.
      </p>
      <label className="mt-3 block text-sm font-bold text-accent-dark">
        Type {DELETE_PHRASE} to confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="mt-1 w-full rounded-2xl border-2 border-accent/40 bg-surface px-4 py-3 text-base font-semibold text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm font-bold text-accent-dark">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]" checked={removeLocal} onChange={(e) => setRemoveLocal(e.target.checked)} />
        Also remove progress from this device
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-accent-dark">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel} disabled={busy}>
          Keep my account
        </button>
        <button
          type="button"
          className="btn btn-danger flex-1"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await deleteAccountAndData({ removeLocal });
              onDone("Your account and its data were deleted.");
            } catch (e) {
              setError(e instanceof Error ? `Couldn't delete: ${e.message}` : "Couldn't delete. Try again.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
