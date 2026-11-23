"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Translit } from "@/components/Translit";
import { useProgress } from "@/lib/progress";
import { isStoryUnlocked } from "@/lib/stories/engine";
import { useStories } from "@/lib/stories/storage";
import type { StorySummary } from "@/lib/stories/types";

const noop = () => () => {};
/** false during prerender and hydration, true afterwards (progress lives in localStorage). */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Stories grouped by unit; each opens once the unit's first lesson is done. */
export function StoryList({ stories }: { stories: StorySummary[] }) {
  const progress = useProgress();
  const { store } = useStories();
  const hydrated = useHydrated();
  const doneCount = stories.filter((s) => store.done[s.id]).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black text-pretty">Stories</h1>
        <p className="mt-1 font-semibold text-pretty text-muted">
          Short stories about a family in Dhaka, using only the words you have learned. Tap any word to see what it means.
        </p>
        {hydrated && stories.length > 0 && (
          <p className="mt-2 text-sm font-bold text-muted" data-testid="stories-count">
            {doneCount} of {stories.length} read
          </p>
        )}
      </div>

      {stories.length === 0 ? (
        <p className="card p-5 font-semibold text-muted">There are no stories in this copy of the course yet.</p>
      ) : (
        <ol className="flex flex-col gap-5" aria-label="Stories by unit">
          {stories.map((s) => {
            const open = hydrated && isStoryUnlocked(s, progress.completed);
            const rec = store.done[s.id];
            const headingId = `story-unit-${s.unit}`;
            return (
              <li key={s.id} aria-labelledby={headingId} data-testid="story-card" data-story-id={s.id} data-unlocked={open ? "true" : "false"}>
                <h2 id={headingId} className="mb-2 text-xs font-black tracking-wide text-muted uppercase">
                  Unit {s.unitNumber} · {s.unitTitle}
                </h2>
                {open ? (
                  <Link
                    href={`/stories/${s.id}`}
                    className="press card flex min-h-16 items-center gap-4 p-4 [--lip-h:3px] [--lip:var(--color-line-strong)] hover:bg-sunk"
                  >
                    <StoryBadge done={!!rec} />
                    <span className="min-w-0 flex-1">
                      <span lang="bn" className="block text-xl font-bold text-ink [overflow-wrap:anywhere]">
                        {s.title.bn}
                      </span>
                      <span className="block text-sm font-semibold">
                        <Translit tr={s.title.tr} inButton />
                      </span>
                      <span className="block font-bold text-ink">{s.title.en}</span>
                      {s.summary && <span className="mt-0.5 block text-sm font-semibold text-pretty text-muted">{s.summary}</span>}
                      {rec && (
                        <span className="mt-1 block text-sm font-extrabold text-brand-dark">
                          Read · best {rec.best} of {rec.total}
                        </span>
                      )}
                    </span>
                  </Link>
                ) : (
                  <div className="card flex min-h-16 items-center gap-4 p-4 opacity-75" aria-disabled="true">
                    <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunk text-muted">
                      <LockIcon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{s.title.en}</span>
                      <span className="block text-sm font-semibold text-pretty text-muted">
                        <span className="sr-only">Locked. </span>
                        {hydrated ? `Finish the first lesson of Unit ${s.unitNumber} to unlock.` : "Checking your progress…"}
                      </span>
                      {hydrated && s.firstLessonId && (
                        <Link
                          href={`/lesson/${s.firstLessonId}`}
                          className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-extrabold text-brand-dark underline decoration-2 underline-offset-2"
                        >
                          Go to the lesson
                        </Link>
                      )}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function StoryBadge({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
        done ? "bg-brand text-white" : "bg-sun-light text-sun-dark"
      }`}
    >
      {done ? (
        <CheckIcon size={24} />
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5v-13z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 6v13" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}
