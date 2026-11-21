"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { buildRound, finishRound, isAccepted, seededRandom, shuffle } from "@/lib/formality/engine";
import { writeStore } from "@/lib/formality/storage";
import type { FormalityBank, FormalityResult, FormalityScenario } from "@/lib/formality/types";
import { useFormalityStore } from "@/lib/formality/useFormalityStore";
import { Intro } from "./Intro";
import { Question } from "./Question";
import { Summary } from "./Summary";

interface Round {
  scenarios: FormalityScenario[];
  /** Per scenario: display slot -> original option index. */
  orders: number[][];
}

type Phase =
  | { kind: "intro" }
  | { kind: "play"; round: Round; results: FormalityResult[] }
  | { kind: "summary"; round: Round; results: FormalityResult[]; newlyUnlocked: number | null; bestBefore: number | undefined };

/**
 * Formality trainer: intro card, then rounds drawn from the unlocked levels. Progress lives in
 * banglalingo.formality.v1 only; it never touches lesson progress, XP or the streak.
 */
export function FormalityApp({ bank }: { bank: FormalityBank }) {
  const { store, ready } = useFormalityStore();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new screen's heading (not on first load).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (phase.kind !== "play") headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [phase.kind]);

  const start = () => {
    // Random per round (event handler, never during render or prerender).
    const rand = seededRandom(Math.floor(Math.random() * 2 ** 31));
    const scenarios = buildRound(bank, store.unlocked, rand);
    const orders = scenarios.map((s) => shuffle(s.options.map((_, i) => i), rand));
    setPhase({ kind: "play", round: { scenarios, orders }, results: [] });
  };

  const answer = (chosen: number) => {
    if (phase.kind !== "play") return;
    const s = phase.round.scenarios[phase.results.length];
    const results = [...phase.results, { id: s.id, chosen, correct: isAccepted(s, chosen) }];
    if (results.length < phase.round.scenarios.length) {
      setPhase({ ...phase, results });
      return;
    }
    const done = finishRound(bank, store, phase.round.scenarios, results);
    writeStore(done.store);
    setPhase({ kind: "summary", round: phase.round, results, newlyUnlocked: done.newlyUnlocked, bestBefore: done.bestBefore });
  };

  return (
    <AppShell>
      <div className="px-4 pb-8">
        {phase.kind === "intro" && <Intro bank={bank} store={store} ready={ready} onStart={start} headingRef={headingRef} />}
        {phase.kind === "play" &&
          (() => {
            const i = phase.results.length;
            const s = phase.round.scenarios[i];
            return (
              <>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h1 className="text-lg font-black">Formality trainer</h1>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPhase({ kind: "intro" })}
                    aria-label="Quit this round"
                  >
                    Quit
                  </button>
                </div>
                <Question
                  key={`${s.id}-${i}`}
                  scenario={s}
                  tier={bank.tiers.find((t) => t.id === s.tier)}
                  order={phase.round.orders[i]}
                  index={i}
                  total={phase.round.scenarios.length}
                  onDone={answer}
                />
              </>
            );
          })()}
        {phase.kind === "summary" && (
          <Summary
            bank={bank}
            round={phase.round.scenarios}
            results={phase.results}
            newlyUnlocked={phase.newlyUnlocked}
            bestBefore={phase.bestBefore}
            onAgain={start}
            onIntro={() => setPhase({ kind: "intro" })}
            headingRef={headingRef}
          />
        )}
      </div>
    </AppShell>
  );
}
