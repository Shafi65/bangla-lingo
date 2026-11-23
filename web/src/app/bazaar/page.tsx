import type { Metadata } from "next";
import Link from "next/link";
import { BazaarApp } from "@/components/bazaar/BazaarApp";
import { loadBazaar } from "@/lib/bazaar/load";

export const metadata: Metadata = { title: "The bazaar · BanglaLingo" };

export default function BazaarPage() {
  const bank = loadBazaar();
  if (!bank) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-paper px-5">
        <h1 className="text-3xl font-black">The bazaar isn&apos;t open</h1>
        <p className="font-semibold text-muted">This copy of the course has no bazaar stalls.</p>
        <Link href="/practice" className="btn btn-primary">
          Back to Practice
        </Link>
      </main>
    );
  }
  return <BazaarApp bank={bank} />;
}
