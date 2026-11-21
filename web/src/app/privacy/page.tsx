import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = { title: "Privacy · BanglaLingo" };

export default function PrivacyPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Privacy</h1>
      <p className="mt-1 font-semibold text-muted">The short version: your learning stays on your device.</p>

      <div className="mt-6 flex max-w-2xl flex-col gap-4">
        <Item title="Progress and settings">
          Your XP, streak, finished lessons and settings are saved only in this browser (localStorage). There are no
          accounts yet, so nothing about your progress is sent to us. Clearing your browser data erases it.
        </Item>
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
