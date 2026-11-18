// The reviewable things in a lesson (tip, each vocab row, each exercise), each with a content hash.
// Pure, so the server (index progress) and tests share it.
import type { Lesson } from "../types";
import { hashOf } from "./hash";

export type TargetKind = "tip" | "vocab" | "exercise";

export interface Target {
  /** "tip", "vocab:<id>" or the exercise id; also the storage / CSV key. */
  key: string;
  kind: TargetKind;
  hash: string;
  /** Bengali text shown for the item (export column). */
  text: string;
  /** 1-based position in the lesson. */
  seq: number;
}

export type KolkataMap = Record<string, { bn?: string; tr?: string } | undefined>;

const HAS_BN = /[ঀ-৿]/;
const BN_RUN = /[ঀ-৿]+(?:[ ‌‍]+[ঀ-৿]+)*/g;

/** Every string containing Bengali script inside a JSON value, in order, without repeats. */
export function bengaliStrings(value: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const s = v.normalize("NFC");
      if (HAS_BN.test(s) && !out.includes(s)) out.push(s);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

/** Bengali words and phrases written inside a markdown tip. */
export function bengaliRuns(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize("NFC").matchAll(BN_RUN)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

export function buildTargets(lesson: Lesson, kolkata: KolkataMap = {}): Target[] {
  const out: Target[] = [];
  const push = (t: Omit<Target, "seq">) => out.push({ ...t, seq: out.length + 1 });
  if (lesson.tip) push({ key: "tip", kind: "tip", hash: hashOf(lesson.tip), text: bengaliRuns(lesson.tip).join(" / ") });
  for (const v of lesson.vocab ?? []) {
    push({
      key: `vocab:${v.id}`,
      kind: "vocab",
      hash: hashOf({ ...v, kolkata: kolkata[v.id] ?? null }),
      text: v.bn,
    });
  }
  for (const ex of lesson.exercises) {
    push({ key: ex.id, kind: "exercise", hash: hashOf(ex), text: bengaliStrings(ex).join(" / ") });
  }
  return out;
}
