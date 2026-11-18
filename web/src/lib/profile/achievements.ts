// Achievements: computed from ProfileStats only (nothing new is stored). Pure.
import type { ProfileStats } from "./stats";

/** Which motif the badge shows (drawn in components/profile/Badge.tsx). */
export type Motif = "lotus" | "sun" | "star" | "paisley" | "letter" | "fish" | "spiral" | "boat";
/** Badge thread colour: the app's flag green, flag red or marigold. */
export type Tone = "brand" | "accent" | "sun";

export interface Achievement {
  id: string;
  title: string;
  /** What it takes, phrased for a locked badge. */
  goal: string;
  motif: Motif;
  tone: Tone;
  /** Short mark on the badge's tab (a threshold such as "7"), if any. */
  tier?: string;
  earned: boolean;
  /** Progress toward it, capped at target. */
  value: number;
  target: number;
  /** "4 of 7 days" — shown under a locked badge. */
  progressText: string;
}

interface Def {
  id: string;
  title: string;
  goal: string;
  motif: Motif;
  tone: Tone;
  tier?: string;
  /** A number, or worked out from the stats (e.g. the course's script lesson count). */
  target: number | ((s: ProfileStats) => number);
  unit: [singular: string, plural: string];
  value: (s: ProfileStats) => number;
  /** Custom progress text for a locked badge. */
  text?: (s: ProfileStats) => string;
}

const n = (x: number) => x.toLocaleString("en-US");

function closestUnit(s: ProfileStats): string {
  const open = s.playedUnits.filter((u) => u.done > 0 && u.done < u.total);
  if (!open.length) return "No unit started yet";
  const best = open.reduce((a, b) => (b.done / b.total > a.done / a.total ? b : a));
  return `${best.title}: ${best.done} of ${best.total} lessons`;
}

const DEFS: Def[] = [
  { id: "first-lesson", title: "First steps", goal: "Finish your first lesson", motif: "lotus", tone: "brand", target: 1, unit: ["lesson", "lessons"], value: (s) => s.lessonsPlayed },
  { id: "lessons-10", title: "Ten lessons", goal: "Finish 10 lessons", motif: "lotus", tone: "brand", tier: "10", target: 10, unit: ["lesson", "lessons"], value: (s) => s.lessonsPlayed },
  { id: "lessons-50", title: "Fifty lessons", goal: "Finish 50 lessons", motif: "lotus", tone: "brand", tier: "50", target: 50, unit: ["lesson", "lessons"], value: (s) => s.lessonsPlayed },
  { id: "streak-3", title: "Three in a row", goal: "Keep a 3-day streak", motif: "sun", tone: "sun", tier: "3", target: 3, unit: ["day", "days"], value: (s) => s.bestStreak },
  { id: "streak-7", title: "A full week", goal: "Keep a 7-day streak", motif: "sun", tone: "sun", tier: "7", target: 7, unit: ["day", "days"], value: (s) => s.bestStreak },
  { id: "streak-30", title: "A month of days", goal: "Keep a 30-day streak", motif: "sun", tone: "sun", tier: "30", target: 30, unit: ["day", "days"], value: (s) => s.bestStreak },
  { id: "xp-100", title: "100 XP", goal: "Earn 100 XP", motif: "star", tone: "accent", tier: "100", target: 100, unit: ["XP", "XP"], value: (s) => s.xp },
  { id: "xp-500", title: "500 XP", goal: "Earn 500 XP", motif: "star", tone: "accent", tier: "500", target: 500, unit: ["XP", "XP"], value: (s) => s.xp },
  { id: "xp-1000", title: "1,000 XP", goal: "Earn 1,000 XP", motif: "star", tone: "accent", tier: "1K", target: 1000, unit: ["XP", "XP"], value: (s) => s.xp },
  { id: "words-50", title: "50 words", goal: "Learn 50 words", motif: "paisley", tone: "brand", tier: "50", target: 50, unit: ["word", "words"], value: (s) => s.wordsLearned },
  { id: "words-200", title: "200 words", goal: "Learn 200 words", motif: "paisley", tone: "brand", tier: "200", target: 200, unit: ["word", "words"], value: (s) => s.wordsLearned },
  { id: "words-500", title: "500 words", goal: "Learn 500 words", motif: "paisley", tone: "brand", tier: "500", target: 500, unit: ["word", "words"], value: (s) => s.wordsLearned },
  { id: "perfect", title: "Not a slip", goal: "Finish a lesson with every answer right first time", motif: "fish", tone: "sun", target: 1, unit: ["perfect lesson", "perfect lessons"], value: (s) => s.perfectLessons, text: () => "No perfect lesson yet" },
  { id: "first-review", title: "Back for more", goal: "Finish a review session in Practice", motif: "spiral", tone: "brand", target: 1, unit: ["session", "sessions"], value: (s) => (s.reviewed ? 1 : 0), text: () => "No review session yet" },
  { id: "unit-done", title: "Unit complete", goal: "Finish every lesson in one unit", motif: "boat", tone: "accent", target: 1, unit: ["unit", "units"], value: (s) => s.unitsFinished, text: closestUnit },
  {
    id: "script-done",
    title: "Reads the script",
    goal: "Finish every script lesson",
    motif: "letter",
    tone: "accent",
    target: (s) => Math.max(1, s.scriptTotal),
    unit: ["script lesson", "script lessons"],
    value: (s) => (s.scriptComplete ? s.scriptTotal : s.scriptDone),
    text: (s) => `${n(s.scriptDone)} of ${n(s.scriptTotal)} script lessons`,
  },
];

/** Every achievement in display order, earned or not. */
export function achievements(s: ProfileStats): Achievement[] {
  return DEFS.map((d) => {
    const target = typeof d.target === "function" ? d.target(s) : d.target;
    const raw = Math.max(0, d.value(s));
    const earned = d.id === "script-done" ? s.scriptComplete : raw >= target;
    const value = Math.min(raw, target);
    const progressText = d.text
      ? d.text(s)
      : `${n(value)} of ${n(target)} ${target === 1 ? d.unit[0] : d.unit[1]}`;
    return {
      id: d.id,
      title: d.title,
      goal: d.goal,
      motif: d.motif,
      tone: d.tone,
      tier: d.tier,
      earned,
      value,
      target,
      progressText,
    };
  });
}

export const ACHIEVEMENT_IDS: readonly string[] = DEFS.map((d) => d.id);
