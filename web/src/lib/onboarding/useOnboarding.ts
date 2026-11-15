import { useMemo, useSyncExternalStore } from "react";
import { parseOnboarding, readOnboardingRaw, subscribeOnboarding, type OnboardingState } from "./storage";

/** Reactive first-run state; null on the server, first render, or when nothing is stored. */
export function useOnboarding(): OnboardingState | null {
  const raw = useSyncExternalStore(subscribeOnboarding, readOnboardingRaw, () => null);
  return useMemo(() => parseOnboarding(raw), [raw]);
}
