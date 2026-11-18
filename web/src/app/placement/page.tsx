import type { Metadata } from "next";
import Link from "next/link";
import { PlacementApp } from "@/components/placement/PlacementApp";
import { loadPlacement } from "@/lib/placement/load";

export const metadata: Metadata = { title: "Placement test · BanglaLingo" };

export default function PlacementPage() {
  const data = loadPlacement();
  if (!data) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-paper px-5">
        <h1 className="text-3xl font-black">The placement test isn&apos;t available</h1>
        <p className="font-semibold text-muted">This copy of the course has no placement questions. Pick a starting point from the course map instead.</p>
        <Link href="/" className="btn btn-primary">
          Go to the course
        </Link>
      </main>
    );
  }
  return <PlacementApp bank={data.bank} config={data.config} units={data.units} />;
}
