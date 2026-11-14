import { BnText } from "@/components/BnText";
import { ReportButton } from "@/components/report/ReportButton";
import { solutionFor } from "@/lib/answers";
import type { Exercise } from "@/lib/types";
import { Inline } from "./MiniMarkdown";

const PRAISE = ["Nicely done", "Correct", "That's it", "Spot on", "Well done"];

/** Result panel shown in the bottom sheet after checking. */
export function Feedback({
  ex,
  correct,
  lessonId,
}: {
  ex: Exercise;
  correct: boolean;
  /** Lesson the exercise came from (for problem reports). */
  lessonId: string;
}) {
  const sol = solutionFor(ex);
  const tone = correct ? "text-brand-dark" : "text-accent-dark";
  // Deterministic variety: pick by exercise id.
  const praise = PRAISE[[...ex.id].reduce((a, c) => a + c.charCodeAt(0), 0) % PRAISE.length];
  const exerciseId = ex.id.includes(":") ? ex.id.slice(ex.id.indexOf(":") + 1) : ex.id;

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${tone}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        {correct ? <CheckBadge /> : <CrossBadge />}
        <span className="flex-1 text-2xl font-black">{correct ? praise : "Not quite"}</span>
        <ReportButton lessonId={lessonId} exerciseId={exerciseId} />
      </div>
      {sol && (
        <div className="flex min-w-0 flex-col gap-1">
          {!correct && <div className="font-extrabold">The answer is:</div>}
          {"glyph" in sol ? (
            <div className="flex items-center gap-3">
              <span lang="bn" className="bn-display text-4xl font-bold text-ink">{sol.glyph}</span>
              <span className="text-lg font-bold text-ink">sounds like “{sol.sound}”</span>
            </div>
          ) : (
            <>
              {!correct && sol.display !== sol.text.bn && sol.display !== sol.text.en && (
                <div className="text-lg font-bold text-pretty text-ink">{sol.display}</div>
              )}
              <BnText text={sol.text} showEn />
            </>
          )}
        </div>
      )}
      {ex.why && (
        <p
          className={
            correct
              ? "text-sm font-semibold text-pretty text-ink/75 [&_em]:text-inherit [&_strong]:text-inherit"
              : "rounded-xl bg-surface/75 px-3 py-2 text-base font-semibold text-pretty text-ink [&_em]:text-ink [&_strong]:text-ink"
          }
        >
          <span className={`font-black ${tone}`}>Why? </span>
          <Inline text={ex.why} />
        </p>
      )}
    </div>
  );
}

function CheckBadge() {
  return (
    <span className="animate-pop flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
function CrossBadge() {
  return (
    <span className="animate-pop flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
