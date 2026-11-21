import type { Metadata } from "next";
import Link from "next/link";
import { FormalityApp } from "@/components/formality/FormalityApp";
import { loadFormality } from "@/lib/formality/load";

export const metadata: Metadata = { title: "Formality trainer · BanglaLingo" };

export default function FormalityPage() {
  const bank = loadFormality();
  if (!bank) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-paper px-5">
        <h1 className="text-3xl font-black">The formality trainer isn&apos;t available</h1>
        <p className="font-semibold text-muted">This copy of the course has no formality scenarios.</p>
        <Link href="/practice" className="btn btn-primary">
          Back to Practice
        </Link>
      </main>
    );
  }
  return <FormalityApp bank={bank} />;
}
