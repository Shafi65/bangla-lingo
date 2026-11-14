import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LessonSection } from "@/components/guide/LessonSection";
import { getGuideUnit, getGuideUnits } from "@/lib/guide/data";

export function generateStaticParams() {
  return getGuideUnits().map((u) => ({ unit: u.id }));
}

export async function generateMetadata({ params }: PageProps<"/guide/[unit]">): Promise<Metadata> {
  const { unit } = await params;
  const u = getGuideUnit(unit);
  return { title: u ? `${u.title} · Guidebook · BanglaLingo` : "Unit not found" };
}

export default async function GuideUnitPage({ params }: PageProps<"/guide/[unit]">) {
  const { unit } = await params;
  const u = getGuideUnit(unit);
  if (!u) notFound();
  const all = getGuideUnits();
  const i = all.findIndex((x) => x.id === u.id);
  const prev = all[i - 1];
  const next = all[i + 1];

  return (
    <AppShell>
      <p>
        <Link href="/guide" className="font-extrabold text-brand-dark underline">
          ‹ Guidebook
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-black">{u.title}</h1>
      {u.description && <p className="mt-1 text-lg font-semibold text-muted">{u.description}</p>}

      {u.lessons === null ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-line bg-white p-6 text-center">
          <p className="text-xl font-black">Coming soon</p>
          <p className="mt-1 font-semibold text-muted">This unit&rsquo;s notes are still being written.</p>
        </div>
      ) : (
        <>
          <nav aria-label="Lessons in this unit" className="mt-4">
            <ul className="flex flex-wrap gap-2">
              {u.lessons.map((l) => (
                <li key={l.id}>
                  <a href={`#${l.id}`} className="inline-block rounded-full border-2 border-line bg-white px-3 py-1 text-sm font-extrabold hover:bg-gray-50">
                    {l.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 space-y-6">
            {u.lessons.map((l, idx) => (
              <LessonSection
                key={l.id}
                lesson={l}
                index={u.lessons!.slice(0, idx).filter((x) => x.kind === "lesson").length}
              />
            ))}
          </div>
        </>
      )}

      <nav aria-label="Other units" className="mt-8 flex justify-between gap-3">
        {prev ? (
          <Link href={`/guide/${prev.id}`} className="btn btn-ghost !px-4 !text-base">‹ {prev.title}</Link>
        ) : <span />}
        {next && (
          <Link href={`/guide/${next.id}`} className="btn btn-ghost !px-4 !text-base">{next.title} ›</Link>
        )}
      </nav>
    </AppShell>
  );
}
