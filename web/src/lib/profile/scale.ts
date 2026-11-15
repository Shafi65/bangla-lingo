// Axis helpers for the profile charts. Pure.

/**
 * Clean axis ticks from 0 (1/2/5 × 10^n steps); the last tick is the axis
 * maximum and is >= max(max, min). niceTicks(70) -> [0, 20, 40, 60, 80].
 */
export function niceTicks(max: number, min = 10, count = 4): number[] {
  if (!Number.isFinite(max)) max = 0;
  const top = Math.max(max, min);
  const raw = top / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.999; v += step) ticks.push(Math.round(v));
  return ticks;
}
