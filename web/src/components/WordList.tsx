"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STRENGTH_LABELS, strength, type Strength } from "@/lib/review/scheduler";
import type { WordIndex } from "@/lib/review/targets";
import type { ReviewWord } from "@/lib/review/types";
import { AppShell } from "./AppShell";
import { SpeakButton } from "./SpeakButton";
import { StrengthMeter } from "./review/StrengthMeter";
import { useReviewData } from "./review/useReviewData";

type StrengthFilter = "all" | "due" | Strength;

/** Lowercase, drop diacritics-like marks ("hya~" -> "hya") for transliteration search. */
function latinKey(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "");
}

export function WordList({ words, index }: { words: ReviewWord[]; index: WordIndex }) {
  const { memory, now, learned } = useReviewData(words, index);
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("all");
  const [filter, setFilter] = useState<StrengthFilter>("all");

  const mine = useMemo(() => words.filter((w) => learned.has(w.id)), [words, learned]);
  const units = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of mine) if (!seen.has(w.unit)) seen.set(w.unit, w.unitTitle);
    return [...seen];
  }, [mine]);

  const level = (w: ReviewWord) => strength(memory.words[w.id], now);
  const isDue = (w: ReviewWord) => {
    const r = memory.words[w.id];
    return !!r && now > 0 && r.due <= now;
  };
  const dueCount = now ? mine.filter(isDue).length : 0;

  const q = query.trim();
  const qLatin = latinKey(q);
  const visible = mine.filter((w) => {
    if (unit !== "all" && w.unit !== unit) return false;
    if (filter === "due" && !isDue(w)) return false;
    if (typeof filter === "number" && level(w) !== filter) return false;
    if (!q) return true;
    return (
      w.bn.normalize("NFC").includes(q.normalize("NFC")) ||
      (!!qLatin && (latinKey(w.tr).includes(qLatin) || w.en.toLowerCase().includes(q.toLowerCase())))
    );
  });
  const groups: { unit: string; title: string; words: ReviewWord[] }[] = [];
  for (const w of visible) {
    const g = groups[groups.length - 1];
    if (g?.unit === w.unit) g.words.push(w);
    else groups.push({ unit: w.unit, title: w.unitTitle, words: [w] });
  }

  const total = mine.length;
  const chips: { key: StrengthFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "due", label: `Due${now ? ` (${dueCount})` : ""}` },
    ...([1, 2, 3, 4] as const).map((s) => ({ key: s as StrengthFilter, label: STRENGTH_LABELS[s] })),
  ];

  return (
    <AppShell>
      <h1 className="text-3xl font-black">My words</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        {now === 0
          ? " "
          : total === 0
            ? "Words from lessons you finish are collected here."
            : `${total} ${total === 1 ? "word" : "words"} · ${dueCount} due for review`}
      </p>

      {now === 0 ? (
        <div className="mt-8 h-48 animate-pulse rounded-3xl bg-surface" aria-hidden />
      ) : total === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-line bg-surface p-6 text-center">
          <p className="text-xl font-black">No words yet</p>
          <p className="mt-1 font-semibold text-muted">Each lesson you finish adds a handful.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Start a lesson
          </Link>
        </div>
      ) : (
        <>
          {dueCount > 0 && (
            <Link href="/practice" className="btn btn-primary mt-5 w-full">
              Review {dueCount} {dueCount === 1 ? "word" : "words"} now
            </Link>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <label className="block">
              <span className="sr-only">Search your words</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Bengali, transliteration or English"
                className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-base font-semibold outline-none focus:border-brand focus-visible:outline-none"
              />
            </label>
            {units.length > 1 && (
              <label className="flex items-center gap-3">
                <span className="shrink-0 text-sm font-extrabold text-muted">Unit</span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-2xl border-2 border-line bg-surface px-3 py-2.5 text-base font-bold outline-none focus:border-brand"
                >
                  <option value="all">All units</option>
                  {units.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by strength">
              {chips.map((c) => (
                <button
                  key={String(c.key)}
                  type="button"
                  aria-pressed={filter === c.key}
                  onClick={() => setFilter(c.key)}
                  className={`rounded-full border-2 px-3 py-1 text-sm font-extrabold transition ${
                    filter === c.key
                      ? "border-brand bg-brand-light text-brand-dark"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 && <p className="mt-6 font-semibold text-muted">No words match these filters.</p>}
          {groups.map((g) => (
            <section key={g.unit} className="mt-8" aria-labelledby={`w-${g.unit}`}>
              <h2 id={`w-${g.unit}`} className="mb-2 text-lg font-black">
                {g.title}
                <span className="ml-2 text-sm font-bold text-muted">{g.words.length}</span>
              </h2>
              <ul className="flex flex-col divide-y-2 divide-line rounded-2xl border-2 border-line bg-surface">
                {g.words.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-3 py-3">
                    <SpeakButton bn={w.bn} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span lang="bn" className="block text-xl font-bold">{w.bn}</span>
                      <span className="block text-sm font-semibold text-muted italic">{w.tr}</span>
                    </div>
                    <div className="flex max-w-[45%] flex-col items-end gap-1 text-right">
                      <span className="font-bold">{w.en}</span>
                      <span className="flex items-center gap-2">
                        {isDue(w) && <span className="text-xs font-extrabold text-accent-dark">due</span>}
                        <StrengthMeter level={level(w)} showLabel />
                      </span>
                    </div>
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
