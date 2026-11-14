import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getGuideUnits, type GuideUnit } from "@/lib/guide/data";

export const metadata: Metadata = {
  title: "Guidebook · BanglaLingo",
  description: "Grammar notes, tips and vocabulary for every unit of the course.",
};

function UnitCard({ unit }: { unit: GuideUnit }) {
  const soon = unit.lessons === null;
  const body = (
    <>
      <div className="min-w-0">
        <h3 className="text-lg font-black">{unit.title}</h3>
        {unit.description && <p className="font-semibold text-muted">{unit.description}</p>}
        <p className="mt-1 text-sm font-bold text-muted">
          {soon
            ? "Coming soon"
            : `${unit.lessonCount} ${unit.lessonCount === 1 ? "lesson" : "lessons"} · ${unit.wordCount} new ${unit.track === "script" ? "letters and words" : "words"}`}
        </p>
      </div>
      {!soon && <span aria-hidden className="shrink-0 text-2xl font-black text-brand-dark">›</span>}
    </>
  );
  const cls = "flex items-center justify-between gap-3 rounded-2xl border-2 border-b-4 border-line bg-white p-4";
  return soon ? (
    <div className={`${cls} opacity-70`}>{body}</div>
  ) : (
    <Link href={`/guide/${unit.id}`} className={`${cls} hover:bg-gray-50`}>
      {body}
    </Link>
  );
}

export default function GuidePage() {
  const units = getGuideUnits();
  const main = units.filter((u) => u.track === "main");
  const script = units.filter((u) => u.track === "script");
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Guidebook</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        Grammar notes and word lists for every unit, to read before or after a lesson.
      </p>
      <p className="mt-2">
        <Link href="/dictionary" className="font-extrabold text-brand-dark underline">
          Search the dictionary
        </Link>
      </p>

      {[
        { title: "Words and grammar", list: main },
        { title: "Reading and writing", list: script },
      ].map(
        ({ title, list }) =>
          list.length > 0 && (
            <section key={title} aria-label={title} className="mt-8">
              <h2 className="mb-3 text-xl font-black text-brand-dark">{title}</h2>
              <ul className="space-y-3">
                {list.map((u) => (
                  <li key={u.id}>
                    <UnitCard unit={u} />
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </AppShell>
  );
}
