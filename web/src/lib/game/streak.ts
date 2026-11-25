// The streak calendar: the last seven days, each marked done, frozen, missed or still to do.
// Pure: callers pass `today` (local YYYY-MM-DD).
import type { ProgressState } from "../progress";

/** done: practised · frozen: covered by a freeze · missed · today: not done yet · none: before the first activity */
export type DayMark = "done" | "frozen" | "missed" | "today" | "none";

export interface WeekDay {
  day: string;
  /** Short weekday name, e.g. "Mon". */
  label: string;
  mark: DayMark;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The seven days ending today, oldest first. */
export function streakWeek(p: ProgressState, today: string): WeekDay[] {
  const active = new Set(Object.keys(p.daily).filter((k) => (p.daily[k] ?? 0) > 0));
  if (p.lastActiveDate) active.add(p.lastActiveDate);
  const frozen = new Set(p.frozen);
  const first = [...active].sort()[0];
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d - 6 + i));
    const day = t.toISOString().slice(0, 10);
    const mark: DayMark = active.has(day)
      ? "done"
      : frozen.has(day)
        ? "frozen"
        : day === today
          ? "today"
          : !first || day < first
            ? "none"
            : "missed";
    return { day, label: WEEKDAYS.at(t.getUTCDay()) ?? "", mark };
  });
}
