import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Privacy · BanglaLingo" };

export default function PrivacyPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Privacy</h1>
      <p className="mt-1 font-semibold text-muted">
        {ACCOUNTS_ENABLED
          ? "The short version: your learning stays on your device unless you choose to sign in."
          : "The short version: your learning stays on your device."}
      </p>

      <div className="mt-6 flex max-w-2xl flex-col gap-4">
        {ACCOUNTS_ENABLED ? (
          <>
            <Item title="Progress and settings">
              Your XP, streak, finished lessons and settings are saved in this browser (localStorage). Without an
              account, nothing about your progress is sent to us, and clearing your browser data erases it.
            </Item>
            <Item title="Accounts (optional)">
              Signing in is optional. If you sign in, we store your email address (to send sign-in links) and a copy of
              your progress so it can sync across your devices: XP, streak, daily XP for the last 60 days, finished
              lessons and scores, per-word review memory, settings, your intro answers, and your formality, handwriting,
              speaking self-ratings and placement results. It is kept with Supabase, our database and sign-in
              provider, and protected so that only your account can read it. Your sign-in session is kept in this
              browser&apos;s storage, not in a cookie. Speaking recordings are never uploaded, signed in or not.
            </Item>
            <Item title="Your data, your controls">
              In Settings → Account you can download everything as a JSON file, sign out (with the option to also remove
              progress from this device), or delete your account. Deleting removes your sign-in and every synced record
              from the server straight away.
            </Item>
          </>
        ) : (
          <Item title="Progress and settings">
            Your XP, streak, finished lessons and settings are saved only in this browser (localStorage). There are no
            accounts yet, so nothing about your progress is sent to us. Clearing your browser data erases it.
          </Item>
        )}
        <Item title="Speaking practice">
          Recordings you make in speaking practice stay on your device. They are never uploaded.
        </Item>
        <Item title="Translate">
          If you use machine translation on the Translate page, the text you type is sent to Microsoft Azure Translator
          to get the result. This only happens when you press Translate and the service is set up. Course lookups
          happen on your device.
        </Item>
        <Item title="Audio">
          Recorded clips use a computer-generated voice (Microsoft Azure). No one has recorded their own voice for
          the app.
        </Item>
        <Item title="Report a problem">
          &ldquo;Report a problem&rdquo; opens a public GitHub issue. Anyone can read it, so please don&apos;t include
          personal details.
        </Item>
        <Item title="Analytics and cookies">
          There are no analytics, no tracking and no cookies.
        </Item>
      </div>

      <p className="mt-6 text-sm font-semibold text-muted">
        <Link href="/settings" className="font-bold text-brand-dark underline">
          Back to settings
        </Link>
      </p>
    </AppShell>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-1 font-semibold text-muted">{children}</p>
    </section>
  );
}
