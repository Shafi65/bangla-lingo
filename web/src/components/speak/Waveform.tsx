import type { Wave } from "@/lib/speak/audio";

/**
 * One waveform as mirrored bars. Colour (green / red) is backed by the text label above it, so the
 * two are never told apart by colour alone. `scale` is this wave's share of the shared time axis.
 */
export function Waveform({
  label,
  wave,
  status,
  scale,
  tone,
  testId,
}: {
  label: string;
  wave: Wave | null;
  status: "loading" | "ready" | "error";
  scale: number;
  tone: "native" | "you";
  testId: string;
}) {
  const color = tone === "native" ? "text-brand" : "text-accent";
  const n = wave?.bars.length ?? 0;
  const seconds = wave ? ` · ${wave.seconds.toFixed(1)} s` : "";
  return (
    <div data-testid={testId} data-status={status}>
      <p className="mb-1 text-sm font-extrabold text-muted">
        {label}
        {seconds}
      </p>
      <div className="flex h-16 items-center rounded-2xl bg-sunk px-2">
        {status === "ready" && wave ? (
          <svg
            role="img"
            aria-label={
              wave.silent ? `${label}: no sound was picked up` : `${label} waveform, ${wave.seconds.toFixed(1)} seconds`
            }
            viewBox={`0 0 ${n * 3} 48`}
            preserveAspectRatio="none"
            className={`h-12 ${color}`}
            style={{ width: `${Math.max(8, Math.min(1, scale) * 100)}%` }}
          >
            {wave.bars.map((b, i) => {
              const h = Math.max(2, b * 46);
              return <rect key={i} x={i * 3 + 0.5} y={24 - h / 2} width={2} height={h} rx={1} fill="currentColor" />;
            })}
          </svg>
        ) : (
          <span className="px-1 text-sm font-semibold text-muted">
            {status === "loading" ? "Drawing waveform…" : "Waveform unavailable"}
          </span>
        )}
      </div>
    </div>
  );
}
