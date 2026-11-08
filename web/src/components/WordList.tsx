"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProgress } from "@/lib/progress";
import type { VocabItem } from "@/lib/types";
import { AppShell } from "./AppShell";
import { SpeakButton } from "./SpeakButton";

export interface WordGroup {
  lessonId: string;
  lessonTitle: string;
  unitTitle: string;
  words: VocabItem[];
}

export function WordList({ groups }: { groups: WordGroup[] }) {
  const { completed } = useProgress();
  const [query, setQuery] = useState("");

  // Learned groups, each word listed once (first lesson that taught it).
  const learned = useMemo(() => {
    const seen = new Set<string>();
    return groups
      .filter((g) => completed[g.lessonId])
      .map((g) => ({
        ...g,
        words: g.words.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true))),
      }))
      .filter((g) => g.words.length > 0);
  }, [groups, completed]);

  const total = learned.reduce((n, g) => n + g.words.length, 0);
  const q = query.trim().toLowerCase();
  const visible = q
    ? learned
        .map((g) => ({
          ...g,
          words: g.words.filter(
            (w) => w.en.toLowerCase().includes(q) || w.tr.toLowerCase().includes(q) || w.bn.includes(query.trim()),
          ),
        }))
        .filter((g) => g.words.length > 0)
    : learned;

  return (
    <AppShell>
      <h1 className="text-3xl font-black">My words</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        {total === 0
          ? "Words from lessons you finish are collected here."
          : `${total} ${total === 1 ? "word" : "words"} from ${learned.length} ${learned.length === 1 ? "lesson" : "lessons"}.`}
      </p>

      {total === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-line bg-white p-6 text-center">
          <p className="text-xl font-black">No words yet</p>
          <p className="mt-1 font-semibold text-muted">Each lesson you finish adds a handful.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Start a lesson
          </Link>
        </div>
      ) : (
        <>
          <label className="mt-6 block">
            <span className="sr-only">Search your words</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your words"
              className="w-full rounded-2xl border-2 border-line bg-white px-4 py-3 text-base font-semibold outline-none focus:border-brand focus-visible:outline-none"
            />
          </label>
          {visible.length === 0 && (
            <p className="mt-6 font-semibold text-muted">No words match “{query.trim()}”.</p>
          )}
          {visible.map((g) => (
            <section key={g.lessonId} className="mt-8" aria-labelledby={`w-${g.lessonId}`}>
              <h2 id={`w-${g.lessonId}`} className="mb-2 text-lg font-black">
                {g.lessonTitle}
                <span className="ml-2 text-sm font-bold text-muted">{g.unitTitle}</span>
              </h2>
              <ul className="flex flex-col divide-y-2 divide-line rounded-2xl border-2 border-line bg-white">
                {g.words.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-3 py-3">
                    <SpeakButton bn={w.bn} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span lang="bn" className="block text-xl font-bold">{w.bn}</span>
                      <span className="block text-sm font-semibold text-muted italic">{w.tr}</span>
                    </div>
                    <span className="max-w-[45%] text-right font-bold">{w.en}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </AppShell>
  );
}
