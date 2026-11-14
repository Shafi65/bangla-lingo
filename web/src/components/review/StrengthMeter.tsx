import { STRENGTH_LABELS, type Strength } from "@/lib/review/scheduler";

const FILL: Record<Strength, string> = {
  1: "bg-accent",
  2: "bg-sun",
  3: "bg-brand/70",
  4: "bg-brand",
};

/** Four-bar strength meter (1 weak .. 4 strong). */
export function StrengthMeter({ level, showLabel = false }: { level: Strength; showLabel?: boolean }) {
  const label = STRENGTH_LABELS[level];
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`Strength: ${label}, ${level} of 4`}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {([1, 2, 3, 4] as const).map((i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full ${i <= level ? FILL[level] : "bg-line"}`}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      {showLabel && <span className="text-xs font-extrabold text-muted" aria-hidden>{label}</span>}
    </span>
  );
}
