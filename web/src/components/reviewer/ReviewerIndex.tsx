"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexLevel } from "@/lib/reviewer/data";
import { lessonProgress, type LessonProgress } from "@/lib/reviewer/storage";
import { useReviewState } from "@/lib/reviewer/store";
import { Chip } from "./bits";

type Filter = "all" | "unreviewed" | "flagged" | "done";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unreviewed", label: "Unreviewed" },
  { id: "flagged", label: "Flagged" },
  { id: "done", label: "Done" },
];

const matches = (f: Filter, p: LessonProgress) =>
  f === "all" || (f === "unreviewed" && p.status !== "done") || (f === "flagged" && p.flagged) || (f === "done" && p.status === "done");

export function ReviewerIndex({ levels }: { levels: IndexLevel[] }) {
  const state = useReviewState();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () =>
      levels.map((lv) => ({
        ...lv,
        units: lv.units.map((u) => ({
          ...u,
          lessons: u.lessons.map((l) => ({ l, p: lessonProgress(state, l.id, l.t.map(([key, hash]) => ({ key, hash }))) })),
        })),
      })),
    [levels, state],
  );

  const all = rows.flatMap((lv) => lv.units.flatMap((u) => u.lessons));
  const done = all.filter((x) => x.p.status === "done").length;
  const items = all.reduce((n, x) => n + x.p.total, 0);
  const reviewed = all.reduce((n, x) => n + x.p.reviewed, 0);
  const flagged = all.filter((x) => x.p.flagged).length;
  const next = all.find((x) => x.p.status !== "done");
  const counts: Record<Filter, number> = {
    all: all.length,
    unreviewed: all.filter((x) => matches("unreviewed", x.p)).length,
    flagged,
    done,
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 sm:px-5">
      <h1 className="pt-4 text-2xl font-black sm:text-3xl">Review the course</h1>
      <p className="mt-1 max-w-prose font-semibold text-muted">
        Open a lesson, then mark every exercise, the tip and each word OK, Needs change or Unsure. Your progress below is this reviewer&rsquo;s,
        kept in this browser.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-2 border-line bg-surface p-3">
        <div aria-live="polite" className="text-sm font-bold">
          <span className="text-2xl font-black">
            {done} / {all.length}
          </span>{" "}
          lessons done · {reviewed} / {items} items reviewed · {flagged} flagged
        </div>
        {next ? (
          <Link href={`/reviewer/${next.l.id}`} className="ml-auto inline-flex min-h-10 items-center rounded-xl border-2 border-brand bg-brand px-4 text-base font-extrabold text-white hover:brightness-110">
            Open next unreviewed: {next.l.title}
          </Link>
        ) : (
          <span className="ml-auto font-extrabold text-brand-dark">Every lesson is done. Export your review.</span>
        )}
      </div>

      <div role="group" aria-label="Filter lessons" className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-9 rounded-xl border-2 px-3 text-sm font-extrabold ${
              filter === f.id ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:bg-sunk"
            }`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {rows.map((lv) => {
        const units = lv.units.map((u) => ({ ...u, shown: u.lessons.filter((x) => matches(filter, x.p)) })).filter((u) => u.shown.length > 0);
        if (units.length === 0) return null;
        return (
          <section key={lv.level} className="mt-6" aria-labelledby={`lv-${lv.level}`}>
            <h2 id={`lv-${lv.level}`} className="text-xl font-black capitalize">
              {lv.level}
            </h2>
            {units.map((u) => {
              const uDone = u.lessons.filter((x) => x.p.status === "done").length;
              return (
                <div key={u.id} className="mt-3">
                  <h3 className="flex flex-wrap items-baseline gap-2 text-base font-extrabold">
                    {u.title}
                    {u.track === "script" && <Chip>Script</Chip>}
                    <span className="text-sm font-bold text-muted">
                      {uDone} / {u.lessons.length} done
                    </span>
                  </h3>
                  <ul className="mt-1.5 overflow-hidden rounded-2xl border-2 border-line bg-surface">
                    {u.shown.map(({ l, p }) => {
                      const pct = p.total ? Math.round((p.reviewed / p.total) * 100) : 0;
                      return (
                        <li key={l.id} className="border-b border-line last:border-b-0">
                          <Link href={`/reviewer/${l.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-sunk sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                            <span className="min-w-0">
                              <span className="font-extrabold [overflow-wrap:anywhere]">{l.title}</span>{" "}
                              <span className="font-mono text-xs font-bold text-muted">{l.id}</span>
                              {l.kind !== "lesson" && <span className="ml-1"><Chip>{l.kind}</Chip></span>}
                              {l.draft && <span className="ml-1"><Chip tone="warn">draft</Chip></span>}
                            </span>
                            <span className="flex items-center gap-2 sm:order-none">
                              <span
                                className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-sunk sm:w-24"
                                role="progressbar"
                                aria-label={`${l.title} review progress`}
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <span className={`block h-full rounded-full ${p.status === "done" ? "bg-brand" : "bg-brand/70"}`} style={{ width: `${pct}%` }} />
                              </span>
                              <span className="text-sm font-bold whitespace-nowrap">
                                {p.reviewed}/{p.total}
                              </span>
                            </span>
                            <span className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:justify-end">
                              {p.needsChange > 0 && <Chip tone="bad">{p.needsChange} change</Chip>}
                              {p.unsure > 0 && <Chip tone="warn">{p.unsure} unsure</Chip>}
                              {p.changed > 0 && <Chip tone="warn">{p.changed} changed since review</Chip>}
                              {p.rating !== undefined && <Chip tone="info">natural {p.rating}/5</Chip>}
                              {p.status === "done" && !p.flagged && <Chip tone="good">Done</Chip>}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      {all.length > 0 && counts[filter] === 0 && <p className="mt-6 font-bold text-muted">No lessons match this filter.</p>}
    </div>
  );
}
