// Smart review: public entry point for UI code.
//
//   useDueCount(): number   words due for review right now (0 during SSR and the
//                           first client render, so it never causes a hydration
//                           mismatch; updates each minute and on every answer).
//   useNow(): number        minute-resolution clock for client components (0 on the server).
//
// Pure logic lives in scheduler.ts, targets.ts, state.ts and session.ts and can
// be imported without React or the DOM.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { hasWordIndex, loadWordIndex, syncWordMemory } from "../memory";
import { useProgress, useWordMemory } from "../progress";
import { dueIds } from "./state";

export * from "./scheduler";
export * from "./state";
export * from "./session";
export type { ReviewWord } from "./types";

const MINUTE = 60_000;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  clockTimer ??= setInterval(() => clockListeners.forEach((l) => l()), MINUTE / 2);
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** Current time rounded down to the minute (stable snapshot); 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => 0,
  );
}

/** Number of words due now. Triggers the one-off index fetch so pending answers get applied. */
export function useDueCount(): number {
  const memory = useWordMemory();
  const progress = useProgress();
  const now = useNow();
  useEffect(() => {
    if (hasWordIndex()) syncWordMemory(progress);
    else if (memory.pending.length || Object.keys(progress.completed).length) void loadWordIndex();
  }, [memory.pending.length, progress]);
  return useMemo(() => (now ? dueIds(memory, now).length : 0), [memory, now]);
}
