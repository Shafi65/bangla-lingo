// Small display helpers for review screens. Pure.

/** "in 5 min", "in 3 h", "tomorrow", "in 4 days". `ms` = target - now (>= 0). */
export function untilText(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return d <= 1 ? "tomorrow" : `in ${d} days`;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago". `ms` = now - then. */
export function agoText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d <= 1 ? "yesterday" : `${d} days ago`;
}
