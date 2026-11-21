"use client";

import Link from "next/link";
import type { FormalityBank, FormalityResult, FormalityScenario } from "@/lib/formality/types";

/** End of a round: score, best, any newly opened level, and what to look at again. */
export function Summary({
  bank,
  round,
  results,
  newlyUnlocked,
  bestBefore,
  onAgain,
  onIntro,
  headingRef,
}: {
  bank: FormalityBank;
  round: FormalityScenario[];
  results: FormalityResult[];
  newlyUnlocked: number | null;
  bestBefore: number | undefined;
  onAgain: () => void;
  onIntro: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const score = results.filter((r) => r.correct).length;
  const total = round.length;
  const byId = new Map(round.map((s) => [s.id, s]));
  const missed = results.filter((r) => !r.correct).map((r) => ({ r, s: byId.get(r.id)! }));
  const newTier = newlyUnlocked ? bank.tiers.find((t) => t.id === newlyUnlocked) : undefined;
  const newBest = bestBefore === undefined || score > bestBefore;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border-2 border-line bg-surface p-6 text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black outline-none">
          Round complete
        </h1>
        <p className="mt-2 text-5xl font-black text-brand-dark tabular-nums" data-testid="formality-score">
          {score}/{total}
        </p>
        <p className="mt-1 font-bold text-muted">
          {score === total ? "Perfect: you picked the right level every time." : score >= bank.unlockScore ? "Well judged!" : "Keep going: these take practice."}
        </p>
        {newBest && bestBefore !== undefined && <p className="mt-1 text-sm font-extrabold text-brand-dark">New best score!</p>}
        {newTier && (
          <p className="mt-4 rounded-2xl bg-sun-light px-4 py-3 font-extrabold text-sun-dark" data-testid="formality-unlocked">
            Level {newTier.id} is open: {newTier.title}
          </p>
        )}
      </div>

      {missed.length > 0 && (
        <section aria-labelledby="formality-missed">
          <h2 id="formality-missed" className="mb-3 text-lg font-black">
            Look at these again
          </h2>
          <ul className="flex flex-col gap-3">
            {missed.map(({ r, s }) => (
              <li key={s.id} className="card p-4">
                <p className="text-sm font-bold text-pretty text-muted">{s.situation}</p>
                <p className="mt-2 text-sm font-semibold">
                  You picked{" "}
                  <span lang="bn" className="text-lg font-bold text-accent-dark">
                    {s.options[r.chosen].bn}
                  </span>
                </p>
                <p className="text-sm font-semibold">
                  Better:{" "}
                  {s.answer.map((a, i) => (
                    <span key={a}>
                      {i > 0 && " or "}
                      <span lang="bn" className="text-lg font-bold text-brand-dark">
                        {s.options[a].bn}
                      </span>
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-sm font-semibold text-pretty">{s.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-primary w-full" onClick={onAgain}>
          Play another round
        </button>
        <button type="button" className="btn btn-ghost w-full" onClick={onIntro}>
          See the levels
        </button>
        <Link href="/practice" className="btn btn-ghost w-full">
          Back to Practice
        </Link>
      </div>
    </div>
  );
}
