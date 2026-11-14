"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildSession, dueIds, mistakeIds, nextDue, sessionTranslit, strength, type SessionMode } from "@/lib/review";
import type { WordIndex } from "@/lib/review/targets";
import type { ReviewWord } from "@/lib/review/types";
import type { Lesson } from "@/lib/types";
import { AppShell } from "./AppShell";
import { RepeatIcon } from "./icons";
import { LessonPlayer } from "./lesson/LessonPlayer";
import { SpeakButton } from "./SpeakButton";
import { StrengthMeter } from "./review/StrengthMeter";
import { agoText, untilText } from "./review/format";
import { useReviewData } from "./review/useReviewData";

type Tab = "review" | "mistakes";

export function PracticeHub({ words, index }: { words: ReviewWord[]; index: WordIndex }) {
  const { memory, now, learned } = useReviewData(words, index);
  const [tab, setTab] = useState<Tab>("review");
  const [session, setSession] = useState<{ n: number; lesson: Lesson; translit: Record<string, string> } | null>(
    null,
  );

  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const known = (id: string) => learned.has(id) && byId.has(id);
  const due = now ? dueIds(memory, now, known) : [];
  const upcoming = now ? nextDue(memory, now, known) : undefined;
  const mistakes = mistakeIds(memory).filter((id) => byId.has(id));
  const levels = [0, 0, 0, 0];
  if (now) for (const id of learned) levels[strength(memory.words[id], now) - 1]++;

  const start = (mode: SessionMode, ids?: string[]) => {
    // Runs in a click handler: reading the clock and Math.random is fine here.
    const { lesson } = buildSession({
      words,
      memory,
      learned,
      mode,
      ids,
      now: Date.now(),
      rand: Math.random,
    });
    if (lesson.exercises.length === 0) return;
    setSession((s) => ({ n: (s?.n ?? 0) + 1, lesson, translit: sessionTranslit(words, lesson) }));
  };

  if (session) {
    return (
      <LessonPlayer
        key={session.n}
        lesson={session.lesson}
        mode="practice"
        translit={session.translit}
        onExit={() => setSession(null)}
      />
    );
  }

  const tabClass = (t: Tab) =>
    `flex-1 rounded-xl px-3 py-2 text-base font-black transition ${
      tab === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
    }`;

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Practice</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        Each word comes back just before you would forget it.
      </p>

      <div role="tablist" aria-label="Practice" className="mt-6 flex gap-1 rounded-2xl bg-line p-1">
        <button
          type="button"
          role="tab"
          id="tab-review"
          aria-selected={tab === "review"}
          aria-controls="panel-review"
          className={tabClass("review")}
          onClick={() => setTab("review")}
        >
          Review
        </button>
        <button
          type="button"
          role="tab"
          id="tab-mistakes"
          aria-selected={tab === "mistakes"}
          aria-controls="panel-mistakes"
          className={tabClass("mistakes")}
          onClick={() => setTab("mistakes")}
        >
          Mistakes
          {now > 0 && mistakes.length > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-white">{mistakes.length}</span>
          )}
        </button>
      </div>

      {tab === "review" ? (
        <section id="panel-review" role="tabpanel" aria-labelledby="tab-review" className="mt-6">
          {now === 0 ? (
            <div className="h-48 animate-pulse rounded-3xl bg-surface" aria-hidden />
          ) : learned.size === 0 ? (
            <Empty
              title="Nothing to review yet"
              body="Finish your first lesson and its words will show up here."
              href="/"
              cta="Go to the course"
            />
          ) : (
            <>
              <div className="rounded-3xl border-2 border-line bg-surface p-6 text-center">
                {due.length > 0 ? (
                  <>
                    <p className="text-5xl font-black text-brand-dark" data-testid="due-count">
                      {due.length}
                    </p>
                    <p className="mt-1 text-lg font-extrabold">
                      {due.length === 1 ? "word is" : "words are"} due for review
                    </p>
                    <button type="button" className="btn btn-primary mt-5 w-full" onClick={() => start("due")}>
                      <RepeatIcon /> Review {due.length} {due.length === 1 ? "word" : "words"} due
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black" data-testid="due-count">
                      {upcoming === undefined || upcoming - now >= 12 * 3_600_000
                        ? "Nothing due — come back tomorrow"
                        : "Nothing due right now"}
                    </p>
                    {upcoming !== undefined && (
                      <p className="mt-1 font-semibold text-muted">Next word is due {untilText(upcoming - now)}.</p>
                    )}
                    <button type="button" className="btn btn-ghost mt-5 w-full" onClick={() => start("weak")}>
                      Practise your weakest words
                    </button>
                  </>
                )}
              </div>

              <h2 className="mt-8 mb-3 text-lg font-black">Your {learned.size} words</h2>
              <ul className="grid grid-cols-4 gap-2" aria-label="Words by strength">
                {(["Weak", "Fair", "Good", "Strong"] as const).map((label, i) => (
                  <li key={label} className="rounded-2xl border-2 border-line bg-surface px-2 py-3 text-center">
                    <StrengthMeter level={(i + 1) as 1 | 2 | 3 | 4} />
                    <span className="block text-2xl font-black">{levels[i]}</span>
                    <span className="block text-xs font-bold text-muted">{label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-center">
                <Link href="/words" className="font-extrabold text-brand-dark underline">
                  See all your words
                </Link>
              </p>
            </>
          )}
        </section>
      ) : (
        <section id="panel-mistakes" role="tabpanel" aria-labelledby="tab-mistakes" className="mt-6">
          {now === 0 ? (
            <div className="h-48 animate-pulse rounded-3xl bg-surface" aria-hidden />
          ) : mistakes.length === 0 ? (
            <Empty
              title="No mistakes to fix"
              body="Words you get wrong are collected here until you get them right three times in a row."
            />
          ) : (
            <>
              <button type="button" className="btn btn-primary w-full" onClick={() => start("mistakes", mistakes)}>
                <RepeatIcon /> Practise these
              </button>
              <ul className="mt-4 flex flex-col divide-y-2 divide-line rounded-2xl border-2 border-line bg-surface">
                {mistakes.map((id) => {
                  const w = byId.get(id)!;
                  const rec = memory.words[id];
                  return (
                    <li key={id} className="flex items-center gap-3 px-3 py-3">
                      <SpeakButton bn={w.bn} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span lang="bn" className="block text-xl font-bold">{w.bn}</span>
                        <span className="block text-sm font-semibold text-muted italic">{w.tr}</span>
                      </div>
                      <div className="max-w-[48%] text-right">
                        <span className="block font-bold">{w.en}</span>
                        {rec?.lastWrong !== undefined && (
                          <span className="block text-xs font-bold text-accent-dark">
                            missed {agoText(Math.max(0, now - rec.lastWrong))}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}
    </AppShell>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-surface p-6 text-center">
      <p className="text-xl font-black">{title}</p>
      <p className="mt-1 font-semibold text-muted">{body}</p>
      {href && cta && (
        <Link href={href} className="btn btn-primary mt-5">
          {cta}
        </Link>
      )}
    </div>
  );
}
