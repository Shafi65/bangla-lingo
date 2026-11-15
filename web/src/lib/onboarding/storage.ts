// First-run answers, kept on this device only. Own key so it never risks the progress blob.
// Every function is SSR-safe and swallows storage errors (private mode, quota, disabled).

export const ONBOARDING_KEY = "banglalingo.onboarding.v1";

export const REASONS = ["family", "partner", "travel", "heritage", "curiosity"] as const;
export type Reason = (typeof REASONS)[number];

/** "new": starts at the first lesson. "some": picks a starting point (placement test is a later feature). */
export const LEVELS = ["new", "some"] as const;
export type KnownLevel = (typeof LEVELS)[number];

export const START_POINTS = ["lesson", "alphabet", "unit1"] as const;
export type StartPoint = (typeof START_POINTS)[number];

export interface OnboardingState {
  version: 1;
  /** True once the learner finished or skipped the intro. */
  completed: boolean;
  /** True when they left through "Skip intro". */
  skipped: boolean;
  completedAt?: string; // ISO timestamp
  reason?: Reason;
  level?: KnownLevel;
  startAt?: StartPoint;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

/** Parse a stored blob; anything malformed is "absent" (null). */
export function parseOnboarding(raw: string | null): OnboardingState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OnboardingState> | null;
    if (!v || typeof v !== "object" || v.version !== 1 || typeof v.completed !== "boolean") return null;
    return {
      version: 1,
      completed: v.completed,
      skipped: v.skipped === true,
      completedAt: typeof v.completedAt === "string" ? v.completedAt : undefined,
      reason: oneOf(REASONS, v.reason),
      level: oneOf(LEVELS, v.level),
      startAt: oneOf(START_POINTS, v.startAt),
    };
  } catch {
    return null;
  }
}

/** The stored state, or null when absent, unreadable, or on the server. */
export function readOnboarding(): OnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    return parseOnboarding(window.localStorage.getItem(ONBOARDING_KEY));
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** For useSyncExternalStore: same-tab writes and cross-tab `storage` events. */
export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ONBOARDING_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The raw stored string (a stable snapshot for useSyncExternalStore); null on the server or when unreadable. */
export function readOnboardingRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return null;
  }
}

/** Save the state. Returns false when storage is unavailable. */
export function writeOnboarding(state: Omit<OnboardingState, "version">): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ version: 1, ...state }));
    notify();
    return true;
  } catch {
    return false;
  }
}

/** Forget the answers and the completed flag ("Restart intro"). */
export function clearOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // nothing to clear
  }
  notify();
}
