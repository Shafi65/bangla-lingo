import type { ProgressState } from "@/lib/progress";
import type { OnboardingState, Reason } from "./storage";

/** Any sign the learner has already used the app (XP, a finished lesson, a practised day, word memory is not counted). */
export function hasAnyProgress(p: Pick<ProgressState, "xp" | "completed" | "lastActiveDate" | "daily">): boolean {
  return (
    p.xp > 0 ||
    p.lastActiveDate !== null ||
    Object.keys(p.completed).length > 0 ||
    Object.keys(p.daily).length > 0
  );
}

/**
 * The home page sends a visitor to /welcome only when the intro was never
 * finished or skipped AND there is no progress at all, so existing learners never see it.
 */
export function shouldShowOnboarding(
  progress: Pick<ProgressState, "xp" | "completed" | "lastActiveDate" | "daily">,
  onboarding: OnboardingState | null,
): boolean {
  if (onboarding?.completed) return false;
  return !hasAnyProgress(progress);
}

/** Display labels for the "why" answers, shared by the flow and the home-screen line. */
export const REASON_LABELS: Record<Reason, { title: string; sub: string }> = {
  family: { title: "Family", sub: "Relatives who speak Bengali" },
  partner: { title: "My partner", sub: "To talk with someone I love" },
  travel: { title: "Travel", sub: "A trip to Bangladesh" },
  heritage: { title: "Heritage", sub: "Reconnecting with my roots" },
  curiosity: { title: "Curiosity", sub: "I like learning languages" },
};

/** A friendly line for the home screen (not wired up yet; see onboarding state `reason`). */
export function reasonLine(reason: Reason | undefined): string | null {
  switch (reason) {
    case "family":
      return "Every word brings you closer to your family.";
    case "partner":
      return "Words to share with someone special.";
    case "travel":
      return "Each lesson is one less phrase to fumble in Dhaka.";
    case "heritage":
      return "Finding your way back to your roots, one word at a time.";
    case "curiosity":
      return "Curious minds make the best learners.";
    default:
      return null;
  }
}
