"use client";

import Link from "next/link";
import { useState } from "react";
import { useProgress, type ProgressState } from "@/lib/progress";
import type { Exercise, Lesson } from "@/lib/types";
import { AppShell } from "./AppShell";
import { RepeatIcon } from "./icons";
import { LessonPlayer } from "./lesson/LessonPlayer";

export interface PracticePoolLesson {
  id: string;
  title: string;
  exercises: Exercise[];
}

const SESSION_SIZE = 10;
const MAX_MATCH = 2;

/**
 * Pick a mixed set of exercises from finished lessons, favouring lessons with
 * lower best accuracy. Runs only from a click handler (uses Math.random).
 */
function buildSession(pool: PracticePoolLesson[], p: ProgressState): Lesson {
  const candidates = pool
    .filter((l) => p.completed[l.id])
    .flatMap((l) => {
      const weight = 1 + (1 - p.completed[l.id].bestAccuracy) * 3;
      return l.exercises.map((ex) => ({ lessonId: l.id, ex, key: Math.random() ** (1 / weight) }));
    })
    .sort((a, b) => b.key - a.key); // weighted sampling without replacement

  const picked: Exercise[] = [];
  let matches = 0;
  for (const c of candidates) {
    if (picked.length >= SESSION_SIZE) break;
    if (c.ex.type === "match_pairs" && ++matches > MAX_MATCH) continue;
    // Prefix ids so exercises from different lessons never collide.
    picked.push({ ...c.ex, id: `${c.lessonId}:${c.ex.id}` });
  }
  return { id: "practice", unit: "practice", title: "Mixed review", vocab: [], exercises: picked };
}

export function PracticeHub({ pool }: { pool: PracticePoolLesson[] }) {
  const progress = useProgress();
  const [session, setSession] = useState<{ n: number; lesson: Lesson } | null>(null);
  const done = pool.filter((l) => progress.completed[l.id]);

  if (session) {
    return (
      <LessonPlayer
        key={session.n}
        lesson={session.lesson}
        mode="practice"
        onExit={() => setSession(null)}
      />
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Practice</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        Ten quick exercises mixed from lessons you have finished, with extra
        weight on the ones that gave you trouble.
      </p>

      {done.length === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-line bg-white p-6 text-center">
          <p className="text-xl font-black">Nothing to review yet</p>
          <p className="mt-1 font-semibold text-muted">Finish your first lesson and it will show up here.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Go to the course
          </Link>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary mt-8 w-full"
            onClick={() => setSession((s) => ({ n: (s?.n ?? 0) + 1, lesson: buildSession(pool, progress) }))}
          >
            <RepeatIcon /> Start practice
          </button>
          <h2 className="mt-10 mb-3 text-lg font-black">Drawing from</h2>
          <ul className="flex flex-col divide-y-2 divide-line rounded-2xl border-2 border-line bg-white">
            {done.map((l) => {
              const acc = Math.round(progress.completed[l.id].bestAccuracy * 100);
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-extrabold">{l.title}</span>
                  <span className={`text-sm font-bold ${acc < 75 ? "text-accent-dark" : "text-muted"}`}>
                    best {acc}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AppShell>
  );
}
