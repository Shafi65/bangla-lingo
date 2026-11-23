import type { Metadata } from "next";
import Link from "next/link";
import { FamilyApp } from "@/components/family/FamilyApp";
import { loadKin } from "@/lib/family/load";

export const metadata: Metadata = { title: "My family · BanglaLingo" };

export default function FamilyPage() {
  const kin = loadKin();
  if (!kin) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-paper px-5">
        <h1 className="text-3xl font-black">My family isn&apos;t available</h1>
        <p className="font-semibold text-muted">This copy of the course has no family data.</p>
        <Link href="/practice" className="btn btn-primary">
          Back to Practice
        </Link>
      </main>
    );
  }
  return <FamilyApp kin={kin} />;
}
