import Link from "next/link";
import type { RefObject } from "react";
import { Knot, VStitch } from "./Thread";

const STAGES = [
  { title: "A warm-up", sub: "7 questions everyone gets" },
  { title: "Questions at your level", sub: "9 more, picked from how the warm-up went" },
  { title: "Fine-tuning", sub: "9 last ones to settle where you start" },
];

export function Intro({ headingRef, onBegin }: { headingRef: RefObject<HTMLHeadingElement | null>; onBegin: () => void }) {
  return (
    <div className="animate-rise flex flex-1 flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="text-[2.1rem] leading-[1.1] font-black text-balance outline-none">
          Find where you start
        </h1>
        <p className="text-lg font-semibold text-pretty text-muted">
          A short test for people who already know some Bengali. It suggests a starting point in the course, from the
          alphabet up to the intermediate track.
        </p>
      </div>

      <ol aria-label="How the test works" className="flex flex-col">
        {STAGES.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[18px_1fr] gap-x-4">
            <div className="flex flex-col items-center">
              <span className="mt-1">
                <Knot state={i === 0 ? "here" : "todo"} />
              </span>
              {i < STAGES.length - 1 && <VStitch sewn={false} className="flex-1" />}
            </div>
            <div className={i < STAGES.length - 1 ? "pb-5" : ""}>
              <p className="text-lg font-black">{s.title}</p>
              <p className="font-semibold text-muted">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-4 font-semibold text-ink shadow-[var(--shadow-lift)]">
        <li>About 8 minutes, with listening and reading.</li>
        <li>You can&apos;t fail. A wrong answer just tells us where to start.</li>
        <li>No hearts and no XP, and nothing counts against you.</li>
        <li>Stop whenever you like and you&apos;ll get a result from what you answered.</li>
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <button type="button" className="btn btn-primary w-full" onClick={onBegin}>
          Begin
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center self-center rounded-lg px-3 py-1 font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline">
          Not now
        </Link>
      </div>
    </div>
  );
}
