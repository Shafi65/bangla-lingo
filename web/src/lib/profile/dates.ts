// Calendar-day arithmetic on local "YYYY-MM-DD" keys (the format progress.ts
// uses for `daily` and `lastActiveDate`). Pure; never reads the clock.

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/** Whole days from `a` to `b` (positive when b is later). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The key `n` days after `key` (n may be negative). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Day of week, Monday = 0 … Sunday = 6. */
export function weekdayMon(key: string): number {
  const [y, m, d] = parts(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Nov 9" (locale-independent so tests and server/client agree). */
export function shortDate(key: string): string {
  const [, m, d] = parts(key);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Monday, Nov 9". */
export function longDate(key: string): string {
  return `${WEEKDAYS[weekdayMon(key)]}, ${shortDate(key)}`;
}
