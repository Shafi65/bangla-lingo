// The "night sky" of letters: every script letter is a star that brightens as the learner masters it.
// Pure: no React, no DOM, no clock (callers pass `now`).
import { strength, type WordRecord } from "../review/scheduler";
import type { WriteGroup, WriteLetter } from "../write/letters";
import type { WriteState } from "../write/storage";

/** 0 not met yet · 1 met in a lesson · 2 known · 3 mastered. */
export type StarLevel = 0 | 1 | 2 | 3;

export interface StarInput {
  lessonDone: boolean;
  write: WriteState;
  memory: WordRecord | undefined;
  now: number;
}

export function starLevel({ lessonDone, write, memory, now }: StarInput): StarLevel {
  const s = memory ? strength(memory, now) : 0;
  if (write === "written" || s >= 4) return 3;
  if (write === "traced" || s >= 3) return 2;
  if (lessonDone || write !== "new" || memory) return 1;
  return 0;
}

/** A met letter whose review is due flickers: it needs a visit to stay bright. */
export const starDue = (memory: WordRecord | undefined, now: number) => !!memory && memory.due <= now;

export const LEVEL_TEXT: Record<StarLevel, string> = {
  0: "not met yet",
  1: "met in a lesson",
  2: "known",
  3: "mastered",
};

export interface PlacedStar {
  letter: WriteLetter;
  lessonId: string;
  x: number;
  y: number;
}

export interface Constellation {
  id: string;
  title: string;
  /** Top of the band and its height, in sky units. */
  y: number;
  height: number;
  stars: PlacedStar[];
  /** Lines between consecutive letters of the same lesson (indexes into stars). */
  links: [number, number][];
}

export const SKY_WIDTH = 360;
const PER_ROW = 6;
const ROW_H = 58;
const BAND_GAP = 46;
const MARGIN_X = 34;

/** Small deterministic hash in [0, 1). */
function noise(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Lay every group out as its own constellation, top to bottom. Deterministic. */
export function layoutSky(groups: readonly WriteGroup[]): { constellations: Constellation[]; height: number } {
  const out: Constellation[] = [];
  let top = 24;
  for (const g of groups) {
    const flat = g.lessons.flatMap((l) => l.letters.map((letter) => ({ letter, lessonId: l.id })));
    const rows = Math.ceil(flat.length / PER_ROW);
    const height = rows * ROW_H + 18;
    const span = SKY_WIDTH - 2 * MARGIN_X;
    const stars: PlacedStar[] = flat.map(({ letter, lessonId }, i) => {
      const row = Math.floor(i / PER_ROW);
      // Snake through the rows so each lesson's letters stay next to each other.
      const col = row % 2 === 0 ? i % PER_ROW : PER_ROW - 1 - (i % PER_ROW);
      const jx = (noise(`${letter.id}:x`) - 0.5) * 22;
      const jy = (noise(`${letter.id}:y`) - 0.5) * 20;
      return {
        letter,
        lessonId,
        x: Math.round(MARGIN_X + (col / (PER_ROW - 1)) * span + jx),
        y: Math.round(top + 34 + row * ROW_H + jy + Math.sin(col * 1.3 + row) * 6),
      };
    });
    const links: [number, number][] = [];
    for (let i = 1; i < stars.length; i++) if (stars[i].lessonId === stars[i - 1].lessonId) links.push([i - 1, i]);
    out.push({ id: g.id, title: g.title, y: top, height, stars, links });
    top += height + BAND_GAP;
  }
  return { constellations: out, height: top };
}

/** Background specks: fixed positions, so the sky looks the same on every visit. */
export function specks(height: number, n = 70): { x: number; y: number; r: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(noise(`s${i}x`) * SKY_WIDTH),
    y: Math.round(noise(`s${i}y`) * height),
    r: 0.4 + noise(`s${i}r`) * 0.9,
  }));
}
