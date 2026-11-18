/**
 * The placement test's signature element: a kantha running stitch with knots, used for the
 * three stages on the intro, the progress bar while testing and the course on the results.
 */
export function Knot({ state, size = 18 }: { state: "done" | "here" | "todo"; size?: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 overflow-visible">
      {state === "here" && <circle cx={r} cy={r} r={r + 4} className="fill-sun/30" />}
      <circle
        cx={r}
        cy={r}
        r={r - 1.5}
        strokeWidth={3}
        className={
          state === "done"
            ? "fill-brand stroke-brand"
            : state === "here"
              ? "fill-sun stroke-sun-edge"
              : "fill-surface stroke-line-strong"
        }
      />
      {state === "done" && (
        <path
          d={`M${r - 3.5} ${r + 0.2}l2.4 2.4 4.6-4.8`}
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** A vertical running stitch between knots. `sewn` = brand colour (already travelled). */
export function VStitch({ sewn, className = "" }: { sewn: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`my-1 block min-h-5 w-0 border-l-[3px] border-dashed ${sewn ? "border-brand" : "border-line-strong"} ${className}`}
    />
  );
}

/**
 * Horizontal progress: one segment per stage, sewn up to the answered share.
 * Purely visual; the caller provides the accessible progressbar wrapper.
 */
export function HStitch({ segments }: { segments: { fill: number; current: boolean }[] }) {
  return (
    <div className="flex w-full items-center gap-1.5" aria-hidden>
      {segments.map((s, i) => (
        <div key={i} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-sunk">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, s.fill)) * 100)}%` }}
          />
          {/* the running stitch shows through on the unsewn part */}
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <line x1="0" y1="50%" x2="100%" y2="50%" strokeDasharray="2 7" strokeLinecap="round" strokeWidth="2" className={s.current ? "stroke-white/70" : "stroke-white/40"} />
          </svg>
        </div>
      ))}
    </div>
  );
}
