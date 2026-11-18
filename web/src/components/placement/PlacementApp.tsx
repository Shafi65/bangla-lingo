"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { readOnboarding, writeOnboarding } from "@/lib/onboarding";
import { progressStore } from "@/lib/progress";
import { applyPlacement, toStored, writeStoredPlacement } from "@/lib/placement/apply";
import { createSession, placeLearner } from "@/lib/placement/engine";
import type { Background, ItemBank, PlacementConfig, PlacementUnit, SessionState } from "@/lib/placement/types";
import { BackgroundForm } from "./BackgroundForm";
import { Intro } from "./Intro";
import { Results } from "./Results";
import { TestRunner } from "./TestRunner";

type Phase = "intro" | "background" | "test" | "results";

/** Taking the test counts as finishing the intro's "where to start" step. */
function markIntroDone() {
  const prev = readOnboarding();
  if (prev?.completed) return;
  writeOnboarding({ completed: true, skipped: false, completedAt: new Date().toISOString(), reason: prev?.reason, level: "some" });
}

export function PlacementApp({ bank, config, units }: { bank: ItemBank; config: PlacementConfig; units: PlacementUnit[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [bg, setBg] = useState<Background>({});
  const [session, setSession] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const placement = useMemo(
    () => (session && session.stage === "done" ? placeLearner(session, bg, units, config) : null),
    [session, bg, units, config],
  );
  const shownPhase: Phase = phase === "test" && placement ? "results" : phase;
  const firstLessonId = units.find((u) => u.track === "main" && u.lessons.length)?.lessons[0] ?? "";

  // Focus the new screen's heading (keyboard and screen-reader users start at the top).
  // Not on first load: the page itself is the starting point then.
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    if (shownPhase !== "test") headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [shownPhase]);

  const begin = () => {
    // Seeded per attempt so a retake gets different questions.
    setSession(createSession(bank, config, bg, Math.floor(Math.random() * 2 ** 31)));
    setPhase("test");
  };

  const accept = () => {
    if (!placement) return;
    setBusy(true);
    applyPlacement(progressStore, placement, config.completedAccuracy);
    writeStoredPlacement(toStored(placement, bg, true));
    markIntroDone();
    router.push(`/lesson/${encodeURIComponent(placement.startLessonId)}`);
  };
  const decline = () => {
    if (placement) writeStoredPlacement(toStored(placement, bg, false));
    markIntroDone();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
        <span className="text-base font-black text-ink">Placement test</span>
        {shownPhase !== "test" && (
          <Link href="/" aria-label="Close and go to the course" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-sunk hover:text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </Link>
        )}
      </header>
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-2 pb-6">
        {shownPhase === "intro" && <Intro headingRef={headingRef} onBegin={() => setPhase("background")} />}
        {shownPhase === "background" && (
          <BackgroundForm headingRef={headingRef} questions={config.background.questions} value={bg} onChange={setBg} onContinue={begin} />
        )}
        {shownPhase === "test" && session && <TestRunner bank={bank} config={config} session={session} onSession={setSession} />}
        {shownPhase === "results" && placement && (
          <Results
            headingRef={headingRef}
            placement={placement}
            config={config}
            units={units}
            firstLessonId={firstLessonId}
            onAccept={accept}
            onDecline={decline}
            onRetake={() => {
              setSession(null);
              setPhase("background");
            }}
            busy={busy}
          />
        )}
      </main>
    </div>
  );
}
